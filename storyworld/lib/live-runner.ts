/**
 * Live extraction runner (M1 smoke) — shared logic for the two CLI
 * scripts (`scripts/run-live-extraction.ts`, `scripts/review-accept.ts`).
 *
 * The runner is the path that will later run ONE story file through
 * extractor → validation → evidence verification → durable review
 * artifact → explicit human acceptance → commit → checker. This
 * build is offline only: `--mock` is the default (no network, no
 * key); `--live` is gated by the prerequisites in section 3 of the
 * brief and refuses without `--privacy-confirmed`.
 *
 * Honest limits (brief section 3d): the config cap enforces nothing
 * in code, and whether a 0/no-credit OpenRouter key behaves as a
 * server-side hard stop is unverified. The protection is: exact free
 * slug + a full-pricing-object pre-flight that fails closed before
 * EVERY dispatch + a pinned no-fallback provider route (chosen at
 * approval time, passed through here) + a post-call cost flag + a
 * strict no-top-up rule. No unconditional "zero charge" promise is
 * made anywhere in this module.
 *
 * The runner never modifies `worker.ts` or any existing module's
 * behavior. Where it needs different client behavior it constructs
 * its OWN `OpenRouterClient` with an in-memory config override
 * (`maxRetriesPerCall: 0`) and performs retries itself. The repo
 * config file is never written.
 */
import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { StoryworldConfig } from "./config";
import {
  JobBudgetEnvelope,
  LiveCallsDisabledError,
  OpenRouterClient,
  ProviderError,
  JobBudgetExhaustedError,
  UnpricedModelError,
  type ChatCompletionResult,
} from "./openrouter";
import { TelemetryLog } from "./telemetry";
import {
  EXTRACTOR_PROMPT_VERSION,
  EXTRACTOR_SYSTEM_PROMPT,
  buildExtractorUserMessage,
} from "./extractor/prompts";
import { GENIE_EXTRACTOR_OUTPUT_SCHEMA } from "./extractor/schema";
import { getExtractorProfile } from "./extractor/profiles";
import { validateExtractorOutput, type ValidationIssue } from "./extractor/validate";
import {
  codePointLength,
  findQuoteOccurrences,
  normalizeBody,
  utf16ToCodePointIndex,
  verifyExtraction,
} from "./extractor/evidence";
import { ReviewQueue, type ReviewBatch, type ReviewItem, type ReviewSection } from "./review/queue";
import { commitBatch } from "./review/commit";
import { runCheckerDetailed } from "./checker/run";
import { InMemoryStoryworldRepository } from "./state/memory-store";
import { projectState } from "./state/projections";
import type { Branch, Finding } from "./state/types";
import type { CheckerNote } from "./checker/rules";
import {
  STORE_SNAPSHOT_SCHEMA_VERSION,
  loadStoreSnapshotIfExists,
  rehydrateRepository,
  saveStoreSnapshot,
  type StoreSnapshotV1,
} from "./store-snapshot";

export class LiveRunnerError extends Error {
  readonly code:
    | "LIVE_GATE_MISSING"
    | "PRIVACY_NOT_CONFIRMED"
    | "PRICE_PREFLIGHT_FAILED"
    | "DISPATCH_CEILING_EXCEEDED"
    | "PROVIDER_ERROR"
    | "VALIDATION_FAILED"
    | "ARTIFACT_INVALID"
    | "STORY_SHA_MISMATCH"
    | "DECISIONS_INVALID"
    | "STORE_INVALID"
    | "STORE_VERSION_UNKNOWN"
    | "RATE_LIMITED"
    | "BUDGET_EXHAUSTED"
    | "ATTEMPT_LOCKED"
    | "LEDGER_INVALID"
    | "ATTEMPT_MISMATCH"
    | "ATTEMPT_ID_INVALID"
    | "PAID_PATH_UNAUTHORIZED"
    | "OUTPUT_CAP_EXCEEDED"
    | "OUTPUT_TRUNCATED";
  constructor(code: LiveRunnerError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "LiveRunnerError";
    this.code = code;
  }
}

/** Timestamp slug for artifact filenames, e.g. `2026-11-23T02-30-00-123Z`. */
export function timestampSlug(when: Date = new Date()): string {
  return when.toISOString().replace(/[:.]/g, "-");
}

/** SHA-256 hex of the NFC-normalized body (the stored `story_sha256`). */
export function storySha256(body: string): string {
  return createHash("sha256").update(normalizeBody(body), "utf-8").digest("hex");
}

// ---------------------------------------------------------------------------
// 3b. Live gate — every prerequisite is checked and named.
// ---------------------------------------------------------------------------

export interface LiveGateEnv {
  OPENROUTER_API_KEY?: string | undefined;
  GEMINI_API_KEY?: string | undefined;
  [key: string]: string | undefined;
}

/**
 * Check the live prerequisites (brief section 6, group 1). Returns the
 * approved extractor slug. Each missing piece is named in the error —
 * the gate fails closed and never guesses.
 */
export interface StaticPrices {
  /** USD per input token. */
  prompt: number;
  /** USD per output token (including reasoning/thought tokens). */
  completion: number;
}

export interface LivePrerequisites {
  slug: string;
  /**
   * Pinned no-fallback provider route (brief section 3c). Required for
   * OpenRouter; null for providers that have no routing layer (Gemini).
   */
  provider: string | null;
  /** Which API family serves the model. */
  api: "openrouter" | "gemini";
  /** Env var holding this provider's API key. */
  apiKeyEnvVar: string;
  /**
   * Static per-token prices from the approved config entry, for providers
   * without a live pricing catalog (Gemini). Null on the OpenRouter path,
   * where the catalog pre-flight is the price gate.
   */
  staticPrices: StaticPrices | null;
  /** Where the static prices came from (doc URL + retrieval date). Null for OpenRouter. */
  pricesSource: string | null;
}

/**
 * Check the live prerequisites (brief section 6, group 1, plus the
 * section 3c provider route). Returns the approved extractor slug
 * and its pinned provider. Each missing piece is named in the error —
 * the gate fails closed and never guesses.
 */
export function assertLivePrerequisites(
  config: StoryworldConfig,
  env: LiveGateEnv,
): LivePrerequisites {
  if (!config.live_calls.enabled) {
    throw new LiveRunnerError(
      "LIVE_GATE_MISSING",
      "live_calls.enabled is false — live calls are disabled in storyworld.config.json",
    );
  }
  const slug = config.models.extractor;
  if (typeof slug !== "string" || slug.length === 0) {
    throw new LiveRunnerError(
      "LIVE_GATE_MISSING",
      "models.extractor is null — no extractor model is configured",
    );
  }
  if (config.live_calls.hard_cap_usd_per_month === null) {
    throw new LiveRunnerError(
      "LIVE_GATE_MISSING",
      "live_calls.hard_cap_usd_per_month is null — a cap must be set before any live call",
    );
  }
  const approved = config.live_calls.approved_models as Array<Record<string, unknown>>;
  const entry = approved.find((m) => m.slug === slug);
  if (!entry) {
    throw new LiveRunnerError(
      "LIVE_GATE_MISSING",
      `live_calls.approved_models does not contain the extractor slug ${JSON.stringify(slug)}`,
    );
  }
  const api = entry.api === undefined ? "openrouter" : entry.api;
  if (api !== "openrouter" && api !== "gemini") {
    throw new LiveRunnerError(
      "LIVE_GATE_MISSING",
      `live_calls.approved_models entry for ${JSON.stringify(slug)} has unknown api ${JSON.stringify(entry.api)} — ` +
        'expected "openrouter" or "gemini"',
    );
  }

  if (api === "gemini") {
    // Gemini has no provider-routing pin and no live pricing catalog: the
    // price gate is a static, sourced price table in the approved entry.
    const apiKeyEnvVar =
      typeof entry.apiKeyEnvVar === "string" && entry.apiKeyEnvVar.trim().length > 0
        ? entry.apiKeyEnvVar
        : "GEMINI_API_KEY";
    const key = env[apiKeyEnvVar];
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new LiveRunnerError(
        "LIVE_GATE_MISSING",
        `${apiKeyEnvVar} is not set in the environment (.env, git-ignored)`,
      );
    }
    const sp = entry.static_prices as Record<string, unknown> | undefined;
    const prompt = sp?.prompt;
    const completion = sp?.completion;
    if (
      typeof prompt !== "number" || !Number.isFinite(prompt) || prompt < 0 ||
      typeof completion !== "number" || !Number.isFinite(completion) || completion < 0
    ) {
      throw new LiveRunnerError(
        "PRICE_PREFLIGHT_FAILED",
        `approved entry for ${JSON.stringify(slug)} lacks static_prices {prompt, completion} ` +
          "(finite numbers >= 0, USD per token) — fail closed on unknown pricing",
      );
    }
    if (prompt !== 0 || completion !== 0) {
      throw new LiveRunnerError(
        "PAID_PATH_UNAUTHORIZED",
        `approved entry for ${JSON.stringify(slug)} declares nonzero static_prices — ` +
          "this adapter is restricted to free-tier Gemini models (exactly 0/0) on an account with no billing linked; " +
          "a paid path needs a separately designed and authorized change",
      );
    }
    if (typeof entry.prices_source !== "string" || entry.prices_source.trim().length === 0) {
      throw new LiveRunnerError(
        "PRICE_PREFLIGHT_FAILED",
        `approved entry for ${JSON.stringify(slug)} lacks prices_source ` +
          "(where the static prices were verified, with date) — fail closed on unsourced pricing",
      );
    }
    return {
      slug,
      provider: null,
      api: "gemini",
      apiKeyEnvVar,
      staticPrices: { prompt, completion },
      pricesSource: entry.prices_source,
    };
  }

  if (typeof entry.provider !== "string" || entry.provider.trim().length === 0) {
    throw new LiveRunnerError(
      "LIVE_GATE_MISSING",
      `live_calls.approved_models entry for ${JSON.stringify(slug)} has no provider — ` +
        `live mode requires a pinned provider route (section 3c); a null/silent provider route is not acceptable`,
    );
  }
  if (typeof env.OPENROUTER_API_KEY !== "string" || env.OPENROUTER_API_KEY.trim().length === 0) {
    throw new LiveRunnerError(
      "LIVE_GATE_MISSING",
      "OPENROUTER_API_KEY is not set in the environment (.env, git-ignored)",
    );
  }
  return {
    slug,
    provider: entry.provider,
    api: "openrouter",
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    staticPrices: null,
    pricesSource: null,
  };
}

/**
 * Static price pre-flight for providers without a live pricing catalog
 * (Gemini). No network: the gate is the sourced static price table that
 * assertLivePrerequisites already validated. Returns the worst-case cost
 * of one full attempt budget (MAX_CHAT_DISPATCHES dispatches at the
 * configured token bounds) so the operator sees the exposure up front.
 */
export function runStaticPricePreflight(args: {
  staticPrices: StaticPrices;
  maxInputTokensPerDispatch: number;
  maxOutputTokensPerDispatch: number;
}): { worstCaseUsd: number } {
  const perDispatch =
    args.maxInputTokensPerDispatch * args.staticPrices.prompt +
    args.maxOutputTokensPerDispatch * args.staticPrices.completion;
  return { worstCaseUsd: perDispatch * MAX_CHAT_DISPATCHES };
}

/** Local cost from the response usage and static prices; null when usage is unknown. */
export function costFromUsage(
  staticPrices: StaticPrices,
  promptTokens: number | null,
  completionTokens: number | null,
): number | null {
  if (promptTokens === null || completionTokens === null) return null;
  return promptTokens * staticPrices.prompt + completionTokens * staticPrices.completion;
}

// ---------------------------------------------------------------------------
// 3b. Price pre-flight — fails closed, before every dispatch.
// ---------------------------------------------------------------------------

export interface CatalogModelEntry {
  id: string;
  pricing: Record<string, unknown> | null;
}

/** Fetch the models catalog (metadata, no auth, no cost) and find the exact slug. */
export async function fetchCatalogEntry(
  fetchImpl: typeof fetch,
  baseUrl: string,
  slug: string,
): Promise<CatalogModelEntry | null> {
  const response = await fetchImpl(`${baseUrl}/models`, { method: "GET" });
  if (!response.ok) {
    throw new LiveRunnerError(
      "PRICE_PREFLIGHT_FAILED",
      `models catalog fetch failed with HTTP ${response.status} — refusing to call a model whose price is unverified`,
    );
  }
  const data = (await response.json()) as { data?: unknown };
  if (!Array.isArray(data.data)) {
    throw new LiveRunnerError(
      "PRICE_PREFLIGHT_FAILED",
      "models catalog has an unknown shape (no data array) — refusing to call a model whose price is unverified",
    );
  }
  for (const entry of data.data as Array<Record<string, unknown>>) {
    if (entry.id === slug) {
      const pricing = "pricing" in entry ? entry.pricing : null;
      return {
        id: slug,
        pricing: pricing !== null && typeof pricing === "object" && !Array.isArray(pricing)
          ? (pricing as Record<string, unknown>)
          : null,
      };
    }
  }
  return null;
}

function isZeroPrice(value: unknown): boolean {
  return value === "0" || value === 0;
}

/**
 * Every value in the pricing object must be exactly "0" — prompt,
 * completion, and any other billable component the catalog exposes
 * (request, image, reasoning, web_search, ...). A missing pricing
 * object, a missing prompt/completion field, or any non-zero value
 * refuses. Unknown future price fields fail closed by this rule:
 * anything present must be zero, and prompt/completion must be
 * present.
 */
export function assertPricingAllZero(
  entry: CatalogModelEntry | null,
  slug: string,
): Record<string, unknown> {
  if (entry === null) {
    throw new LiveRunnerError(
      "PRICE_PREFLIGHT_FAILED",
      `slug ${JSON.stringify(slug)} is missing from the models catalog — refusing`,
    );
  }
  const pricing = entry.pricing;
  if (pricing === null) {
    throw new LiveRunnerError(
      "PRICE_PREFLIGHT_FAILED",
      `slug ${JSON.stringify(slug)} has no pricing object in the catalog — refusing`,
    );
  }
  for (const required of ["prompt", "completion"]) {
    if (!(required in pricing)) {
      throw new LiveRunnerError(
        "PRICE_PREFLIGHT_FAILED",
        `slug ${JSON.stringify(slug)} is missing the pricing field ${JSON.stringify(required)} — refusing`,
      );
    }
  }
  for (const [field, value] of Object.entries(pricing)) {
    if (!isZeroPrice(value)) {
      throw new LiveRunnerError(
        "PRICE_PREFLIGHT_FAILED",
        `slug ${JSON.stringify(slug)} is not free: pricing.${field} is ${JSON.stringify(value)} (expected "0") — refusing`,
      );
    }
  }
  return pricing;
}

/** Run the full pre-flight: fetch the catalog, locate the exact slug, assert all-zero. */
export async function runPricePreflight(
  fetchImpl: typeof fetch,
  baseUrl: string,
  slug: string,
): Promise<Record<string, unknown>> {
  const entry = await fetchCatalogEntry(fetchImpl, baseUrl, slug);
  return assertPricingAllZero(entry, slug);
}

// ---------------------------------------------------------------------------
// 3a. Dispatch-boundary gating — a counting dispatcher with a hard ceiling.
// ---------------------------------------------------------------------------

/** Hard ceiling on chat-completion dispatches per run: 1 attempt + 2 runner retries. */
export const MAX_CHAT_DISPATCHES = 3;

/**
 * Gemini free-only dispatch bounds. max_tokens 4000 with reasoning_effort
 * "low" is the parameter set proven live on gemini-3.6-flash (2026-11-23):
 * 500 truncated the JSON because reasoning tokens count against the cap.
 * The hard ceiling bounds worst-case spend and the job token envelope.
 */
export const GEMINI_DEFAULT_MAX_TOKENS = 4000;
export const GEMINI_MAX_OUTPUT_TOKENS = 8192;
export const GEMINI_DEFAULT_REASONING_EFFORT = "low";

export interface DispatchCounts {
  chatCompletions: number;
  catalogFetches: number;
  costLookups: number;
  other: number;
}

/**
 * Wraps an injectable fetch and counts dispatches to OpenRouter. The
 * hard ceiling applies to POST /chat/completions dispatches — the
 * billable model calls (1 attempt + 2 runner retries). The catalog
 * metadata fetch (GET /models, no auth, no cost) and the generation
 * cost lookup (GET /generation, after a successful call) are counted
 * and reported separately: they are not attempts, and counting them
 * against the ceiling would make the documented 2 retries
 * unreachable (each retry is preceded by its own pre-flight). The
 * ceiling is enforced before the dispatch, never after.
 */
export class CountingFetch {
  readonly counts: DispatchCounts = {
    chatCompletions: 0,
    catalogFetches: 0,
    costLookups: 0,
    other: 0,
  };

  constructor(private readonly inner: typeof fetch) {}

  readonly fetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("/chat/completions") && method === "POST") {
      if (this.counts.chatCompletions >= MAX_CHAT_DISPATCHES) {
        throw new LiveRunnerError(
          "DISPATCH_CEILING_EXCEEDED",
          `chat-completion dispatch ceiling (${MAX_CHAT_DISPATCHES}) exceeded — stopping before a 4th dispatch`,
        );
      }
      this.counts.chatCompletions += 1;
    } else if (url.includes("/models") && method === "GET") {
      this.counts.catalogFetches += 1;
    } else if (url.includes("/generation") && method === "GET") {
      this.counts.costLookups += 1;
    } else {
      this.counts.other += 1;
    }
    return this.inner(input, init);
  };
}

// ---------------------------------------------------------------------------
// 3c. Attempt ledger — the durable, crash-safe dispatch budget (D2 repair).
// ---------------------------------------------------------------------------

/**
 * Default wait after a 429 whose Retry-After header is missing or invalid.
 * When the server sends a usable Retry-After the ledger records the FULL
 * not-before time, never shortened; only absent/invalid headers fall back
 * to this default.
 */
export const RATE_LIMIT_DEFAULT_WAIT_MS = 60_000;

const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export interface DispatchReservation {
  n: number;
  reservedAt: string;
  status?: string;
  finishedAt?: string;
}

export interface AttemptLedgerData {
  schemaVersion: 1;
  attemptId: string;
  chapterSeq: number;
  storySha256: string;
  reservations: DispatchReservation[];
  retryNotBefore: string | null;
}

/**
 * One ledger file per owner-approved attempt (`attempt-<id>.json` in the
 * git-ignored local dir). Every chat-completion dispatch is RESERVED in
 * the ledger before the network call and completed in place afterwards.
 * A reservation without a completion (process died mid-call) still counts
 * as used: the ledger fails closed on ambiguity. The cap of
 * MAX_CHAT_DISPATCHES is cumulative across invocations of the same
 * attempt id; a new attempt id is the approval reset and is only minted
 * on a new owner approval. Ledger files are append-only records and must
 * never be deleted or renamed to start over: a missing ledger restarts
 * the local count at 0, so removing one is equivalent to a new attempt
 * and requires the same approval.
 *
 * Writes are durable: temp file, fsync, rename, then a best-effort fsync
 * of the containing directory. On platforms without directory fsync the
 * durability guarantee degrades; the owning OpenRouter request log stays
 * the audit source of last resort.
 *
 * Concurrency: an exclusive lock file (`attempt-<id>.lock`) is held for
 * the process lifetime. A concurrent or stale lock refuses. Stale-lock
 * inspection never removes the lock automatically and never discounts
 * the interrupted reservation; a controlled recovery removes ONLY the
 * lock file after the operator confirms the ledger state.
 */
export class AttemptLedger {
  private constructor(
    private readonly path: string,
    private readonly lockPath: string,
    private readonly data: AttemptLedgerData,
    private readonly now: () => Date,
  ) {}

  static acquire(args: {
    dir: string;
    attemptId: string;
    chapterSeq: number;
    storySha256: string;
    now?: () => Date;
  }): AttemptLedger {
    const now = args.now ?? (() => new Date());
    if (!ATTEMPT_ID_PATTERN.test(args.attemptId)) {
      throw new LiveRunnerError(
        "ATTEMPT_ID_INVALID",
        `attempt id ${JSON.stringify(args.attemptId)} is not usable: ` +
          "expected 1-64 chars of letters, digits, dot, underscore or hyphen, starting with a letter or digit",
      );
    }
    mkdirSync(args.dir, { recursive: true });
    const path = join(args.dir, `attempt-${args.attemptId}.json`);
    const lockPath = join(args.dir, `attempt-${args.attemptId}.lock`);

    // Exclusive lock, held until release(). Never auto-removed.
    try {
      const fd = openSync(lockPath, "wx");
      closeSync(fd);
    } catch {
      throw new LiveRunnerError(
        "ATTEMPT_LOCKED",
        `attempt ${JSON.stringify(args.attemptId)} is locked (${lockPath}). ` +
          "Another invocation is running, or a previous one crashed. Inspect the ledger first; " +
          "a controlled recovery removes only the lock file and never discounts the interrupted dispatch.",
      );
    }

    let data: AttemptLedgerData;
    if (existsSync(path)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
      } catch (error) {
        rmSync(lockPath, { force: true });
        throw new LiveRunnerError(
          "LEDGER_INVALID",
          `attempt ledger at ${path} is not valid JSON (${error instanceof Error ? error.message : String(error)}) — refusing all dispatches`,
        );
      }
      const invalid = (): never => {
        rmSync(lockPath, { force: true });
        throw new LiveRunnerError(
          "LEDGER_INVALID",
          `attempt ledger at ${path} is malformed — refusing all dispatches (fail closed)`,
        );
      };
      const isDate = (value: unknown): value is string =>
        typeof value === "string" && !Number.isNaN(Date.parse(value));
      if (
        typeof parsed !== "object" || parsed === null ||
        (parsed as Record<string, unknown>).schemaVersion !== 1 ||
        (parsed as Record<string, unknown>).attemptId !== args.attemptId ||
        !Array.isArray((parsed as Record<string, unknown>).reservations)
      ) {
        invalid();
      }
      const candidate = parsed as {
        reservations: unknown[];
        retryNotBefore: unknown;
      };
      // Every reservation entry must be a well-formed, in-order record; a
      // malformed count field would silently change the dispatch budget.
      for (const [index, entry] of candidate.reservations.entries()) {
        if (typeof entry !== "object" || entry === null) invalid();
        const r = entry as Record<string, unknown>;
        if (!Number.isInteger(r.n) || (r.n as number) < 1) invalid();
        if ((r.n as number) !== index + 1) invalid(); // dense 1..N sequence
        if (!isDate(r.reservedAt)) invalid();
        if (r.status !== undefined && typeof r.status !== "string") invalid();
        if (r.finishedAt !== undefined && !isDate(r.finishedAt)) invalid();
      }
      // retryNotBefore is either null or a strict, finite date. A garbage
      // string used to parse as Invalid Date and silently BYPASS the delay.
      if (candidate.retryNotBefore !== null && !isDate(candidate.retryNotBefore)) {
        invalid();
      }
      data = parsed as AttemptLedgerData;
      // Conservative recovery: a 429 outcome without a recorded cooldown
      // (crash between the two writes in a pre-repair ledger) must not lose
      // the stop. Re-derive the default wait from when the 429 finished.
      if (data.retryNotBefore === null) {
        const lastRateLimited = [...data.reservations]
          .reverse()
          .find((r) => r.status === "http-429");
        if (lastRateLimited !== undefined) {
          const base = Date.parse(lastRateLimited.finishedAt ?? lastRateLimited.reservedAt);
          data.retryNotBefore = new Date(base + RATE_LIMIT_DEFAULT_WAIT_MS).toISOString();
        }
      }
      if (data.chapterSeq !== args.chapterSeq || data.storySha256 !== args.storySha256) {
        rmSync(lockPath, { force: true });
        throw new LiveRunnerError(
          "ATTEMPT_MISMATCH",
          `attempt ${JSON.stringify(args.attemptId)} is bound to chapter ${data.chapterSeq} ` +
            `of a different story body — an attempt covers exactly one chapter of one story`,
        );
      }
    } else {
      data = {
        schemaVersion: 1,
        attemptId: args.attemptId,
        chapterSeq: args.chapterSeq,
        storySha256: args.storySha256,
        reservations: [],
        retryNotBefore: null,
      };
    }

    const ledger = new AttemptLedger(path, lockPath, data, now);
    ledger.persist();
    if (data.retryNotBefore !== null && now() < new Date(data.retryNotBefore)) {
      rmSync(lockPath, { force: true });
      throw new LiveRunnerError(
        "RATE_LIMITED",
        `attempt ${JSON.stringify(args.attemptId)} is rate-limited until ${data.retryNotBefore} ` +
          "(recorded from the server's Retry-After or the default wait) — no dispatch before then",
      );
    }
    return ledger;
  }

  /** Dispatches used so far. Every reservation counts, completed or not. */
  get dispatchesUsed(): number {
    return this.data.reservations.length;
  }

  get retryNotBefore(): string | null {
    return this.data.retryNotBefore;
  }

  /** Reserve one dispatch BEFORE the network call. Throws BUDGET_EXHAUSTED when the cap is reached. */
  reserve(): number {
    if (this.data.reservations.length >= MAX_CHAT_DISPATCHES) {
      throw new LiveRunnerError(
        "BUDGET_EXHAUSTED",
        `attempt ${JSON.stringify(this.data.attemptId)} has used all ${MAX_CHAT_DISPATCHES} ` +
          "dispatches across its invocations — this attempt is over; a further run needs a new owner-approved attempt id",
      );
    }
    const n = this.data.reservations.length + 1;
    this.data.reservations.push({ n, reservedAt: this.now().toISOString() });
    this.persist();
    return n;
  }

  /** Complete a reservation in place after the network call settles. */
  complete(n: number, status: string): void {
    const reservation = this.data.reservations.find((r) => r.n === n);
    if (reservation === undefined) return;
    reservation.status = status;
    reservation.finishedAt = this.now().toISOString();
    this.persist();
  }

  /**
   * 429 outcome as ONE durable transition: the reservation completion
   * and the cooldown land in the same persisted write, so a crash cannot
   * record the 429 without the stop. The server's Retry-After is honored
   * in full when present; only a missing/invalid header falls back to
   * the default wait.
   */
  completeRateLimited(n: number, retryAfterMs: number | null): Date {
    const reservation = this.data.reservations.find((r) => r.n === n);
    if (reservation !== undefined) {
      reservation.status = "http-429";
      reservation.finishedAt = this.now().toISOString();
    }
    const waitMs = retryAfterMs ?? RATE_LIMIT_DEFAULT_WAIT_MS;
    const notBefore = new Date(this.now().getTime() + waitMs);
    this.data.retryNotBefore = notBefore.toISOString();
    this.persist();
    return notBefore;
  }

  /**
   * Record the rate-limit not-before time. The server's Retry-After is
   * honored in full when present; only a missing/invalid header falls
   * back to the default wait. Prefer completeRateLimited() on the 429
   * path; this stays for direct ledger use.
   */
  noteRateLimited(retryAfterMs: number | null): Date {
    const waitMs = retryAfterMs ?? RATE_LIMIT_DEFAULT_WAIT_MS;
    const notBefore = new Date(this.now().getTime() + waitMs);
    this.data.retryNotBefore = notBefore.toISOString();
    this.persist();
    return notBefore;
  }

  /** Release the concurrency lock. The ledger file itself is never touched. */
  release(): void {
    rmSync(this.lockPath, { force: true });
  }

  private persist(): void {
    const tmp = `${this.path}.tmp`;
    const fd = openSync(tmp, "w");
    try {
      writeFileSync(fd, `${JSON.stringify(this.data, null, 2)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, this.path);
    try {
      const dirFd = openSync(dirname(this.path), "r");
      try {
        fsyncSync(dirFd);
      } finally {
        closeSync(dirFd);
      }
    } catch (error) {
      // Only the expected "this platform cannot fsync a directory" cases
      // are tolerated; real disk failures (EIO, ENOSPC, EROFS, EBADF)
      // propagate instead of being silently swallowed.
      const code = (error as NodeJS.ErrnoException).code;
      if (!["ENOSYS", "ENOTSUP", "EOPNOTSUPP", "EINVAL", "EPERM"].includes(code ?? "")) {
        throw error;
      }
      // Durability degrades to the file fsync above; the owning
      // OpenRouter log remains the audit source of last resort.
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Extraction — up to 3 dispatches, at most one validation retry, then stop.
// ---------------------------------------------------------------------------

export type ExtractionMode = "mock" | "live";

export interface RunExtractionDeps {
  /** The counting fetch (wraps the real or mocked fetch). */
  countingFetch: CountingFetch;
  /** Repo config as loaded (the runner overrides maxRetriesPerCall in memory only). */
  config: StoryworldConfig;
  /** The durable per-attempt dispatch budget. Required for every live run. */
  attemptLedger: AttemptLedger;
}

export interface RunExtractionArgs {
  chapterBody: string;
  chapterSeq: number;
  /** Passed to the extractor prompt verbatim per the brief (0 for a standalone chapter). */
  storyOrderBase?: number;
  /** Cast starts empty: extraction discovers the cast; never fabricated. */
  cast?: string[];
  /** Earlier committed events (see priorTimelineFromStore). Human-accepted state only; absent for the first chapter. */
  priorTimeline?: Array<{ summary: string; spanStart: number | null; spanEnd: number | null }>;
  model: string;
  /** Pinned no-fallback provider from the approved entry (live only; null for Gemini). */
  provider?: string | null;
  /** API family from assertLivePrerequisites (default "openrouter"). */
  api?: "openrouter" | "gemini";
  /** Env var holding this provider's API key (default OPENROUTER_API_KEY). */
  apiKeyEnvVar?: string;
  /** Static sourced per-token prices for providers without a pricing catalog. */
  staticPrices?: StaticPrices | null;
  /** Per-dispatch output cap. Gemini: defaults to GEMINI_DEFAULT_MAX_TOKENS, hard-capped at GEMINI_MAX_OUTPUT_TOKENS. */
  maxTokens?: number;
  /** Gemini: reasoning effort (default GEMINI_DEFAULT_REASONING_EFFORT); reasoning tokens count against max_tokens. */
  reasoningEffort?: string;
  /** Extractor profile version (default "extractor.v3", the unchanged baseline candidate). */
  extractorVersion?: string;
  /**
   * Hard cap on chat dispatches for THIS run, 1..MAX_CHAT_DISPATCHES (default 3).
   * Every outbound inference counts: first call, transport retry, and the
   * corrective validation retry alike. Lower it to honor a smaller user budget.
   */
  dispatchCap?: number;
}

export interface ExtractedArtifact {
  /** Extractor profile used (absent in artifacts from before profiles existed = extractor prompt of that run). */
  promptVersion?: string;
  /** The validated, parsed extractor output (a `GenieExtractorOutput` object). */
  output: Record<string, unknown>;
  mode: ExtractionMode;
  attempt: number;
  validationRetries: number;
  modelRequested: string | null;
  modelResolved: string | null;
  provider: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  /**
   * Post-call cost in USD; null when unknown. NEVER provider-confirmed on the
   * Gemini path: see costUsdSource. Free eligibility itself is not observable
   * via the API — the guard is the enforced 0/0 static prices plus an account
   * with no billing linked (a quota error, never a charge, ends a free run).
   */
  costUsd: number | null;
  /**
   * Where costUsd came from: "provider_generation" = the provider's own
   * post-call cost lookup (OpenRouter GET /generation); "usage_estimate" =
   * computed locally as response usage x configured static prices (Gemini —
   * an estimate under configured prices, NOT a provider-confirmed charge);
   * null = cost unknown.
   */
  costUsdSource: "provider_generation" | "usage_estimate" | null;
  /**
   * Worst-case spend of the full dispatch budget under the static price
   * table (Gemini path only; null otherwise). An upper bound, not an estimate.
   */
  worstCaseUsd?: number | null;
  latencyMs: number;
  dispatchCounts: DispatchCounts;
  verification: ReturnType<typeof verifyExtraction>;
}

function formatValidationErrors(errors: ValidationIssue[]): string {
  return errors.map((e) => `- ${e.path}: ${e.message}`).join("\n");
}

/**
 * Run live extraction for one chapter.
 *
 * Retry policy (brief sections 2a + 3a): at most 3 chat-completion
 * dispatches total (1 attempt + 2 runner retries), each preceded by
 * the full price pre-flight. Provider/transport failures are retried
 * while dispatches remain. A validation failure gets exactly ONE
 * retry, with the validator error appended to the user message, then
 * the run stops with VALIDATION_FAILED. The dispatch ceiling is
 * enforced by the counting fetch before every dispatch.
 *
 * No raw model output is ever persisted: only the parsed, validated
 * output object is returned (section 4 — `store_raw_outputs` stays
 * false). A non-JSON model reply fails validation and is never stored.
 */
export async function runExtraction(
  deps: RunExtractionDeps,
  args: RunExtractionArgs,
): Promise<ExtractedArtifact> {
  const profile = getExtractorProfile(args.extractorVersion);
  // The cap is over the attempt ledger's CUMULATIVE dispatches for this attempt id
  // (earlier invocations count), so re-running the same id cannot exceed it.
  const ledgerUsedAtStart = deps.attemptLedger.dispatchesUsed;
  const requestedCap = args.dispatchCap ?? MAX_CHAT_DISPATCHES;
  if (!Number.isInteger(requestedCap) || requestedCap < 1 || requestedCap > MAX_CHAT_DISPATCHES) {
    throw new LiveRunnerError("VALIDATION_FAILED", `dispatchCap must be an integer in 1..${MAX_CHAT_DISPATCHES}`);
  }
  let dispatchCap = requestedCap - ledgerUsedAtStart;
  // Default cap: the ledger itself reports exhaustion (BUDGET_EXHAUSTED) on its reserve().
  if (dispatchCap < 1 && requestedCap === MAX_CHAT_DISPATCHES) dispatchCap = 1;
  if (dispatchCap < 1) {
    throw new LiveRunnerError(
      "DISPATCH_CEILING_EXCEEDED",
      `attempt already used ${ledgerUsedAtStart} dispatch(es); cap is ${requestedCap}`,
    );
  }
  const body = normalizeBody(args.chapterBody);
  if (body.length === 0) {
    throw new LiveRunnerError("VALIDATION_FAILED", "chapter body is empty after normalization");
  }
  // The runner's OWN client instance: in-memory override, repo config untouched.
  const override: StoryworldConfig = {
    ...deps.config,
    openrouter: { ...deps.config.openrouter, maxRetriesPerCall: 0 },
  };
  const client = new OpenRouterClient({
    config: override,
    fetchImpl: deps.countingFetch.fetch,
    telemetry: new TelemetryLog(),
    apiKeyEnvVar: args.apiKeyEnvVar,
    skipGenerationCost: args.api === "gemini",
  });
  const budget = JobBudgetEnvelope.fromConfig(override);
  const baseUserMessage = buildExtractorUserMessage({
    chapterBody: body,
    chapterSeq: args.chapterSeq,
    storyOrderBase: args.storyOrderBase ?? 0,
    cast: args.cast ?? [],
    ...(args.priorTimeline ? { priorTimeline: args.priorTimeline } : {}),
  });

  // Gemini static price gate — once, before any dispatch. The worst case
  // uses a hard token bound (1 token never covers less than 1 byte; Arabic
  // is 2 bytes per UTF-16 unit) and the model's full output ceiling, since
  // the runner does not cap max_tokens: an honest upper bound, not an estimate.
  let worstCaseUsd: number | null = null;
  let geminiMaxTokens: number | undefined;
  if (args.api === "gemini") {
    if (args.staticPrices === null || args.staticPrices === undefined) {
      throw new LiveRunnerError(
        "PRICE_PREFLIGHT_FAILED",
        "gemini run without static prices — fail closed on unknown pricing",
      );
    }
    // Free-only enforcement, repeated here so a caller that skipped the gate
    // still cannot dispatch at declared nonzero prices.
    if (args.staticPrices.prompt !== 0 || args.staticPrices.completion !== 0) {
      throw new LiveRunnerError(
        "PAID_PATH_UNAUTHORIZED",
        "gemini dispatch refused: static_prices must be exactly 0/0 (free tier, no billing linked); " +
          "a paid path needs a separately designed and authorized change",
      );
    }
    // Enforced per-dispatch output cap: the proven value is the default, the
    // hard ceiling keeps the worst case and the job token envelope bounded.
    geminiMaxTokens = args.maxTokens ?? GEMINI_DEFAULT_MAX_TOKENS;
    if (
      !Number.isInteger(geminiMaxTokens) ||
      geminiMaxTokens < 1 ||
      geminiMaxTokens > GEMINI_MAX_OUTPUT_TOKENS
    ) {
      throw new LiveRunnerError(
        "OUTPUT_CAP_EXCEEDED",
        `gemini max_tokens must be an integer in 1..${GEMINI_MAX_OUTPUT_TOKENS} ` +
          `(got ${args.maxTokens}); reasoning tokens count against it, ${GEMINI_DEFAULT_MAX_TOKENS} is the proven value`,
      );
    }
    const maxInputTokens =
      (profile.systemPrompt.length +
        baseUserMessage.length +
        JSON.stringify(profile.schema).length) * 2;
    worstCaseUsd = runStaticPricePreflight({
      staticPrices: args.staticPrices,
      maxInputTokensPerDispatch: maxInputTokens,
      maxOutputTokensPerDispatch: geminiMaxTokens,
    }).worstCaseUsd;
  }

  let attempts = 0;
  let validationRetries = 0;
  let lastValidationErrors: ValidationIssue[] = [];
  let lastProviderMessage: string | null = null;

  while (attempts < dispatchCap) {
    attempts += 1;
    // Price pre-flight before EVERY dispatch — fails closed. OpenRouter
    // checks the live catalog per dispatch; the Gemini static gate runs
    // once before the loop (its sourced prices cannot change mid-run).
    if (args.api !== "gemini") {
      await runPricePreflight(deps.countingFetch.fetch, override.openrouter.baseUrl, args.model);
    }
    // Budget reservation BEFORE the network call: a crash after this line
    // still counts the dispatch as used (the ledger fails closed).
    const reservation = deps.attemptLedger.reserve();
    const userMessage =
      validationRetries > 0
        ? `${baseUserMessage}\n\nThe previous output failed validation. Fix ONLY these problems and return corrected JSON:\n${formatValidationErrors(lastValidationErrors)}`
        : baseUserMessage;
    let result: ChatCompletionResult;
    try {
      result = await client.chatCompletion({
        model: args.model,
        messages: [
          { role: "system", content: profile.systemPrompt },
          { role: "user", content: userMessage },
        ],
        responseFormat: {
          name: "GenieExtractorOutput",
          schema: profile.schema,
        },
        purpose: "extract",
        maxTokens: args.api === "gemini" ? geminiMaxTokens : args.maxTokens,
        reasoningEffort:
          args.api === "gemini"
            ? (args.reasoningEffort ?? GEMINI_DEFAULT_REASONING_EFFORT)
            : args.reasoningEffort,
        provider:
          args.provider !== null && args.provider !== undefined
            ? { order: [args.provider], allow_fallbacks: false }
            : undefined,
        budget,
      });
      deps.attemptLedger.complete(reservation, "ok");
    } catch (error) {
      if (error instanceof LiveRunnerError) {
        deps.attemptLedger.complete(reservation, "refused");
        throw error;
      }
      if (error instanceof JobBudgetExhaustedError) {
        deps.attemptLedger.complete(reservation, "budget");
        throw new LiveRunnerError("PROVIDER_ERROR", `job budget exhausted: ${error.message}`);
      }
      if (error instanceof LiveCallsDisabledError || error instanceof UnpricedModelError) {
        deps.attemptLedger.complete(reservation, "gate");
        throw new LiveRunnerError("LIVE_GATE_MISSING", error.message);
      }
      if (error instanceof ProviderError && error.status === 429) {
        // Rate-limited: stop after the FIRST 429, never burst. The 429
        // outcome and the server's full not-before time (or the default
        // wait) persist in ONE durable transition.
        const notBefore = deps.attemptLedger.completeRateLimited(reservation, error.retryAfterMs);
        throw new LiveRunnerError(
          "RATE_LIMITED",
          `upstream rate-limited (HTTP 429) after ${attempts} dispatch(es) — ` +
            `no further dispatch before ${notBefore.toISOString()}, recorded in the attempt ledger`,
        );
      }
      if (
        error instanceof ProviderError &&
        error.status !== undefined &&
        error.status >= 400 &&
        error.status < 500
      ) {
        // Non-retryable client error: fail fast, do not burn the budget.
        deps.attemptLedger.complete(reservation, `http-${error.status}`);
        throw new LiveRunnerError(
          "PROVIDER_ERROR",
          `non-retryable HTTP ${error.status} on chat/completions — refusing to spend the remaining dispatch budget on retries`,
        );
      }
      // 5xx / transport failure: retry immediately while dispatches remain.
      deps.attemptLedger.complete(reservation, "error");
      lastProviderMessage = error instanceof Error ? error.message : String(error);
      if (attempts >= dispatchCap) {
        throw new LiveRunnerError(
          "PROVIDER_ERROR",
          `extraction failed after ${attempts} dispatch(es): ${lastProviderMessage}`,
        );
      }
      continue;
    }

    if (result.finishReason === "length") {
      // The output cap was hit before the JSON completed (on Gemini,
      // reasoning tokens count against it). Refuse loudly instead of
      // surfacing a misleading schema-validation failure.
      throw new LiveRunnerError(
        "OUTPUT_TRUNCATED",
        `model stopped at the max_tokens output cap before finishing the JSON (finish_reason=length). ` +
          `Reasoning tokens count against the cap on Gemini; retry with a higher max_tokens ` +
          `(up to ${GEMINI_MAX_OUTPUT_TOKENS}) or lower reasoning effort. The truncated output was not parsed.`,
      );
    }
    const validation = validateExtractorOutput(result.output, { requireModality: profile.requireModality });
    if (validation.valid) {
      if (typeof result.output !== "object" || result.output === null || Array.isArray(result.output)) {
        throw new LiveRunnerError("VALIDATION_FAILED", "validated extractor output is not an object");
      }
      return {
        promptVersion: profile.version,
        output: result.output as Record<string, unknown>,
        mode: "live",
        attempt: attempts,
        validationRetries,
        modelRequested: result.modelRequested,
        modelResolved: result.modelResolved,
        provider: args.provider ?? null,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        costUsd:
          result.costUsd ??
          (args.staticPrices != null
            ? costFromUsage(args.staticPrices, result.promptTokens, result.completionTokens)
            : null),
        costUsdSource:
          result.costUsd != null
            ? "provider_generation"
            : args.staticPrices != null
              ? "usage_estimate"
              : null,
        latencyMs: result.latencyMs,
        dispatchCounts: { ...deps.countingFetch.counts },
        verification: verifyExtraction(body, result.output),
        worstCaseUsd,
      };
    }

    lastValidationErrors = validation.errors;
    if (validationRetries >= 1) {
      throw new LiveRunnerError(
        "VALIDATION_FAILED",
        `extractor output failed validation after ${attempts} attempt(s) (one validation retry used) and will not be retried further: ${formatValidationErrors(validation.errors)}`,
      );
    }
    validationRetries += 1;
    if (attempts >= dispatchCap) {
      throw new LiveRunnerError(
        "VALIDATION_FAILED",
        `extractor output failed validation after ${attempts} attempt(s) with no dispatches left for the validation retry: ${formatValidationErrors(validation.errors)}`,
      );
    }
    // Loop: the validation retry is the next dispatch, with the error appended.
  }

  throw new LiveRunnerError(
    "PROVIDER_ERROR",
    `extraction failed after ${attempts} dispatch(es): ${lastProviderMessage ?? "unknown error"}`,
  );
}

// ---------------------------------------------------------------------------
// Mock extraction — deterministic, body-derived, clearly labeled.
// ---------------------------------------------------------------------------

/** Split a normalized body into sentences with code-point [start, end) spans. */
export function sentenceSpans(body: string): Array<{ text: string; start: number; end: number }> {
  const normalized = normalizeBody(body);
  const spans: Array<{ text: string; start: number; end: number }> = [];
  const pattern = /[^.!؟]+[.!؟]?/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalized)) !== null) {
    const raw = match[0];
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const leading = raw.length - raw.trimStart().length;
    const startCp = utf16ToCodePointIndex(normalized, match.index + leading);
    spans.push({ text: trimmed, start: startCp, end: startCp + codePointLength(trimmed) });
  }
  return spans;
}

/** Evidence span for a quote's first occurrence, or null when absent. */
export function spanForQuote(
  body: string,
  quote: string,
): { quote: string; start_offset: number; end_offset: number } | null {
  const normalized = normalizeBody(body);
  const occurrences = findQuoteOccurrences(normalized, normalizeBody(quote));
  if (occurrences.length === 0) return null;
  const [start, end] = occurrences[0];
  return { quote: normalizeBody(quote), start_offset: start, end_offset: end };
}

function stripEdgePunctuation(word: string): string {
  return word.replace(/^[.!؟،,;:()«»"'\s]+/u, "").replace(/[!؟،,;:()«»"'\s.]+$/u, "");
}

/**
 * First word (≥2 code points) occurring at least twice in the body, or
 * null. Used for the mock's ambiguous event: the quote genuinely occurs
 * more than once, so the item is ambiguous until a human picks one.
 */
export function firstRepeatedWord(body: string): string | null {
  const normalized = normalizeBody(body);
  const words = normalized
    .split(/\s+/u)
    .map(stripEdgePunctuation)
    .filter((w) => codePointLength(w) >= 2);
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  for (const w of words) {
    if ((counts.get(w) ?? 0) >= 2) return w;
  }
  return null;
}

/**
 * Build the deterministic mock extractor output (real schema shape).
 * Everything is derived from the chapter body: sentences become the
 * evidence quotes; the first sentence is the proposition statement;
 * one event uses a repeated word when the body has one (ambiguous),
 * and one event carries a quote that is not in the body at all
 * (simulated hallucination → rejected). No story content is invented.
 * Story-time spans are chapter-local placeholders starting at
 * (chapterSeq - 1) * 100 so chapter 2's events sort after chapter 1's.
 */
export function buildMockExtractorOutput(
  chapterBody: string,
  chapterSeq: number,
): Record<string, unknown> {
  const body = normalizeBody(chapterBody);
  const sentences = sentenceSpans(body);
  if (sentences.length === 0) {
    throw new LiveRunnerError("VALIDATION_FAILED", "chapter body has no sentences to extract from");
  }
  const spanOf = (text: string): { quote: string; start_offset: number; end_offset: number } => {
    const span = spanForQuote(body, text);
    if (!span) throw new LiveRunnerError("VALIDATION_FAILED", `mock quote not found in body: ${JSON.stringify(text)}`);
    return span;
  };
  const first = sentences[0];
  const second = sentences[1] ?? first;
  const third = sentences[2] ?? second;
  const base = (chapterSeq - 1) * 100;
  const repeated = firstRepeatedWord(body);
  const ambiguousSpan = repeated !== null ? spanForQuote(body, repeated) : null;

  const hallucinated = "هذا نص غير موجود في الفصل على الإطلاق.";
  return {
    propositions: [
      {
        local_id: "p1",
        statement: first.text,
        evidence: [spanOf(first.text)],
      },
    ],
    events: [
      {
        local_id: "e1",
        kind: "action",
        summary: first.text,
        participants: [{ character: "الشخصية الأولى", role: "actor" }],
        location: null,
        story_time: null,
        span_start: base,
        span_end: base + 1,
        reality_scope: "real",
        certainty: "asserted",
        evidence: [spanOf(first.text)],
        knowledge_transfer: null,
        knowledge_use: null,
      },
      {
        local_id: "e2",
        kind: "action",
        summary: second.text,
        participants: [{ character: "الشخصية الأولى", role: "actor" }],
        location: null,
        story_time: null,
        span_start: base + 2,
        span_end: base + 3,
        reality_scope: "real",
        certainty: "asserted",
        evidence: [
          ambiguousSpan ?? spanOf(second.text),
        ],
        knowledge_transfer: null,
        knowledge_use: null,
      },
      {
        local_id: "e3",
        kind: "action",
        summary: hallucinated,
        participants: [{ character: "الشخصية الأولى", role: "actor" }],
        location: null,
        story_time: null,
        span_start: base + 4,
        span_end: base + 5,
        reality_scope: "real",
        certainty: "asserted",
        evidence: [
          {
            quote: hallucinated,
            start_offset: 0,
            end_offset: codePointLength(hallucinated),
          },
        ],
        knowledge_transfer: null,
        knowledge_use: null,
      },
    ],
    knowledge: [
      {
        character: "الشخصية الأولى",
        proposition_local_id: "p1",
        learned_how: "witnessed",
        certainty: "asserted",
        learned_at_event_local_id: "e1",
        evidence: [spanOf(second.text)],
      },
    ],
    character_facts: [
      {
        character: "الشخصية الأولى",
        kind: "alive",
        value: "حي",
        valid_from_event_local_id: "e1",
        evidence: [spanOf(third.text)],
      },
    ],
    promises: [
      {
        description: third.text,
        raised_at_event_local_id: "e1",
        deadline_event_local_id: null,
        deadline_condition: null,
        status_change: "raised",
        resolved_at_event_local_id: null,
        evidence: [spanOf(third.text)],
      },
    ],
  };
}

/** Run the mock path end-to-end: no client, no network, no key. */
export function runMockExtraction(args: {
  chapterBody: string;
  chapterSeq: number;
}): ExtractedArtifact {
  const body = normalizeBody(args.chapterBody);
  if (body.length === 0) {
    throw new LiveRunnerError("VALIDATION_FAILED", "chapter body is empty after normalization");
  }
  const output = buildMockExtractorOutput(body, args.chapterSeq);
  const validation = validateExtractorOutput(output);
  if (!validation.valid) {
    throw new LiveRunnerError(
      "VALIDATION_FAILED",
      `mock extraction failed validation: ${formatValidationErrors(validation.errors)}`,
    );
  }
  return {
    output,
    mode: "mock",
    attempt: 1,
    validationRetries: 0,
    modelRequested: "mock-extractor-v1",
    modelResolved: null,
    provider: null,
    promptTokens: null,
    completionTokens: null,
    costUsd: null,
    costUsdSource: null,
    latencyMs: 0,
    dispatchCounts: { chatCompletions: 0, catalogFetches: 0, costLookups: 0, other: 0 },
    verification: verifyExtraction(body, output),
  };
}

// ---------------------------------------------------------------------------
// 5. Review-batch artifact (2a output).
// ---------------------------------------------------------------------------

export const REVIEW_BATCH_SCHEMA_VERSION = 1;

export type ItemEvidenceStatus = "verified" | "ambiguous" | "rejected";

/** Per-item evidence status from the batch's own verification state. */
export function itemEvidenceStatus(item: ReviewItem): ItemEvidenceStatus {
  if (item.verificationError !== null) return "rejected";
  if (item.evidence.some((s) => s.ambiguous)) return "ambiguous";
  return "verified";
}

export interface ReviewBatchArtifact {
  schemaVersion: 1;
  artifactKind: "review-batch";
  mode: ExtractionMode;
  batchId: string;
  storyTitle: string | null;
  chapterSeq: number;
  chapterTitle: string | null;
  bodySha256: string;
  bodyChars: number;
  modelRequested: string | null;
  modelResolved: string | null;
  provider: string | null;
  extractor: {
    promptVersion: string;
    attempts: number;
    validationRetries: number;
    promptTokens: number | null;
    completionTokens: number | null;
    costUsd: number | null;
    costUsdSource: "provider_generation" | "usage_estimate" | null;
    latencyMs: number;
    dispatchCounts: DispatchCounts;
  };
  verification: {
    verified: number;
    rejected: number;
    rejectedItems: Array<{ itemPath: string; reason: string }>;
  };
  /** The parsed, validated extractor output (NOT raw model text — section 4). */
  extractorOutput: Record<string, unknown>;
  items: ReviewItem[];
  createdAt: string;
}

export interface BuildArtifactArgs {
  extracted: ExtractedArtifact;
  chapterBody: string;
  chapterSeq: number;
  storyTitle?: string | null;
  chapterTitle?: string | null;
  now?: () => Date;
}

/**
 * Build the review batch via `ReviewQueue` (validates + verifies) and
 * wrap it in the schema-versioned artifact. The batch lives only in
 * memory here; the artifact is the durable record. Nothing is
 * committed and the checker never runs at this stage.
 */
export function buildReviewBatchArtifact(args: BuildArtifactArgs): {
  artifact: ReviewBatchArtifact;
  batch: ReviewBatch;
} {
  const body = normalizeBody(args.chapterBody);
  const queue = new ReviewQueue();
  const batch = queue.createBatch({
    body,
    output: args.extracted.output,
    chapterSeq: args.chapterSeq,
    requireModality: getExtractorProfile(args.extracted.promptVersion).requireModality,
  });
  const artifact: ReviewBatchArtifact = {
    schemaVersion: REVIEW_BATCH_SCHEMA_VERSION,
    artifactKind: "review-batch",
    mode: args.extracted.mode,
    batchId: batch.id,
    storyTitle: args.storyTitle ?? null,
    chapterSeq: args.chapterSeq,
    chapterTitle: args.chapterTitle ?? null,
    bodySha256: batch.bodySha256,
    bodyChars: codePointLength(body),
    modelRequested: args.extracted.modelRequested,
    modelResolved: args.extracted.modelResolved,
    provider: args.extracted.provider,
    extractor: {
      promptVersion: args.extracted.promptVersion ?? EXTRACTOR_PROMPT_VERSION,
      attempts: args.extracted.attempt,
      validationRetries: args.extracted.validationRetries,
      promptTokens: args.extracted.promptTokens,
      completionTokens: args.extracted.completionTokens,
      costUsd: args.extracted.costUsd,
      costUsdSource: args.extracted.costUsdSource,
      latencyMs: args.extracted.latencyMs,
      dispatchCounts: args.extracted.dispatchCounts,
    },
    verification: {
      verified: args.extracted.verification.verified.length,
      rejected: args.extracted.verification.rejected.length,
      rejectedItems: args.extracted.verification.rejected.map((r) => ({
        itemPath: r.itemPath,
        reason: r.reason,
      })),
    },
    extractorOutput: args.extracted.output,
    items: batch.items,
    createdAt: (args.now ?? (() => new Date()))().toISOString(),
  };
  return { artifact, batch };
}

export function reviewBatchFileNames(when: Date = new Date()): {
  json: string;
  md: string;
} {
  const slug = timestampSlug(when);
  return { json: `review-batch-${slug}.json`, md: `review-batch-${slug}.md` };
}

/** Render the human-readable summary of a review-batch artifact. */
export function renderReviewBatchMarkdown(artifact: ReviewBatchArtifact): string {
  const lines: string[] = [];
  lines.push(`# Review batch — chapter ${artifact.chapterSeq}`);
  lines.push("");
  lines.push(`- Mode: ${artifact.mode}${artifact.mode === "mock" ? " (MOCK — no model was called, no network, no key)" : ""}`);
  lines.push(`- Batch id: ${artifact.batchId}`);
  lines.push(`- Story: ${artifact.storyTitle ?? "(untitled)"}`);
  lines.push(`- Chapter SHA-256: \`${artifact.bodySha256}\` (${artifact.bodyChars} chars)`);
  lines.push(`- Model requested: ${artifact.modelRequested ?? "—"}`);
  lines.push(`- Model resolved: ${artifact.modelResolved ?? "—"}`);
  lines.push(`- Provider: ${artifact.provider ?? "—"}`);
  lines.push(`- Attempts: ${artifact.extractor.attempts} (validation retries: ${artifact.extractor.validationRetries})`);
  lines.push(
    `- Tokens: prompt ${artifact.extractor.promptTokens ?? "—"}, completion ${artifact.extractor.completionTokens ?? "—"}`,
  );
  const cost = artifact.extractor.costUsd;
  const costLabel =
    artifact.extractor.costUsdSource === "usage_estimate"
      ? `${cost} (usage x configured static prices — NOT provider-confirmed)`
      : artifact.extractor.costUsdSource === "provider_generation"
        ? `${cost} (provider-reported)`
        : "NULL (unknown)";
  lines.push(`- Cost (USD): ${costLabel}`);
  if (cost !== null && cost !== 0) {
    lines.push(`- **UNEXPECTED CHARGE — cost is ${cost} USD, expected 0. Do not proceed without owner review.**`);
  }
  lines.push(`- Latency: ${artifact.extractor.latencyMs} ms`);
  lines.push(
    `- Dispatches: chat ${artifact.extractor.dispatchCounts.chatCompletions}, catalog ${artifact.extractor.dispatchCounts.catalogFetches}, cost lookups ${artifact.extractor.dispatchCounts.costLookups}`,
  );
  lines.push(
    `- Evidence: ${artifact.verification.verified} verified, ${artifact.verification.rejected} rejected`,
  );
  for (const r of artifact.verification.rejectedItems) {
    lines.push(`  - rejected ${r.itemPath}: ${r.reason}`);
  }
  lines.push("");
  lines.push("## Items (all pending — 0 entries committed)");
  lines.push("");
  lines.push("| id | section | local id | evidence | verification error |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const item of artifact.items) {
    const status = itemEvidenceStatus(item);
    lines.push(
      `| ${item.id} | ${item.section} | ${item.localId ?? "—"} | ${status} | ${item.verificationError ?? "—"} |`,
    );
    for (const span of item.evidence) {
      const occ = span.ambiguous
        ? `ambiguous — ${span.occurrences.length} occurrences, choose one explicitly`
        : `offsets ${span.startOffset}–${span.endOffset}`;
      lines.push(`|  |  |  | \`${span.quote}\` (${occ}) |  |`);
    }
  }
  lines.push("");
  lines.push("0 entries committed — awaiting human acceptance.");
  lines.push(`Created: ${artifact.createdAt}`);
  return `${lines.join("\n")}\n`;
}

/** Write the batch JSON + MD to the out dir. Returns both paths. */
export function writeReviewBatchArtifact(
  outDir: string,
  artifact: ReviewBatchArtifact,
  when: Date = new Date(),
): { jsonPath: string; mdPath: string } {
  mkdirSync(outDir, { recursive: true });
  const names = reviewBatchFileNames(when);
  const jsonPath = join(outDir, names.json);
  const mdPath = join(outDir, names.md);
  writeFileSync(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf-8");
  writeFileSync(mdPath, renderReviewBatchMarkdown(artifact), "utf-8");
  return { jsonPath, mdPath };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strictly validate a parsed review-batch artifact. Unknown schema
 * versions, missing fields, wrong types, or a malformed extractor
 * output refuse — hand-edited JSON is never trusted.
 */
export function parseReviewBatchArtifact(value: unknown): ReviewBatchArtifact {
  if (!isRecord(value)) {
    throw new LiveRunnerError("ARTIFACT_INVALID", "artifact is not a JSON object");
  }
  if (value.schemaVersion !== REVIEW_BATCH_SCHEMA_VERSION) {
    throw new LiveRunnerError(
      "ARTIFACT_INVALID",
      `artifact schemaVersion is ${JSON.stringify(value.schemaVersion)}; ` +
        `this build understands only ${REVIEW_BATCH_SCHEMA_VERSION}`,
    );
  }
  if (value.artifactKind !== "review-batch") {
    throw new LiveRunnerError("ARTIFACT_INVALID", "artifact artifactKind is not \"review-batch\"");
  }
  if (value.mode !== "mock" && value.mode !== "live") {
    throw new LiveRunnerError("ARTIFACT_INVALID", "artifact mode must be \"mock\" or \"live\"");
  }
  if (typeof value.batchId !== "string" || value.batchId.length === 0) {
    throw new LiveRunnerError("ARTIFACT_INVALID", "artifact has no batchId");
  }
  if (typeof value.chapterSeq !== "number" || !Number.isInteger(value.chapterSeq)) {
    throw new LiveRunnerError("ARTIFACT_INVALID", "artifact chapterSeq must be an integer");
  }
  if (typeof value.bodySha256 !== "string" || value.bodySha256.length === 0) {
    throw new LiveRunnerError("ARTIFACT_INVALID", "artifact has no bodySha256");
  }
  if (!isRecord(value.extractor)) {
    throw new LiveRunnerError("ARTIFACT_INVALID", "artifact has no extractor block");
  }
  if (!isRecord(value.verification)) {
    throw new LiveRunnerError("ARTIFACT_INVALID", "artifact has no verification block");
  }
  if (!isRecord(value.extractorOutput)) {
    throw new LiveRunnerError("ARTIFACT_INVALID", "artifact has no extractorOutput object");
  }
  const output = value.extractorOutput;
  for (const section of ["propositions", "events", "knowledge", "character_facts", "promises"]) {
    if (!Array.isArray(output[section])) {
      throw new LiveRunnerError(
        "ARTIFACT_INVALID",
        `artifact extractorOutput.${section} must be an array`,
      );
    }
  }
  if (!Array.isArray(value.items)) {
    throw new LiveRunnerError("ARTIFACT_INVALID", "artifact items must be an array");
  }
  for (const item of value.items as unknown[]) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.section !== "string") {
      throw new LiveRunnerError(
        "ARTIFACT_INVALID",
        "artifact has a malformed review item (needs id and section)",
      );
    }
  }
  return value as unknown as ReviewBatchArtifact;
}

/** Read and strictly validate a review-batch artifact file. */
export function loadReviewBatchArtifact(path: string): ReviewBatchArtifact {
  if (!existsSync(path)) {
    throw new LiveRunnerError("ARTIFACT_INVALID", `no review-batch artifact at ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch (error) {
    throw new LiveRunnerError(
      "ARTIFACT_INVALID",
      `artifact at ${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseReviewBatchArtifact(parsed);
}

// ---------------------------------------------------------------------------
// 6. Decisions file.
// ---------------------------------------------------------------------------

export interface ReviewDecision {
  itemId: string;
  decision: "accept" | "reject";
  reason?: string;
  chosenOccurrence?: [number, number];
  targetPromiseId?: string;
  confirmResolutionConflict?: boolean;
}

/**
 * Strictly validate a parsed decisions file against the artifact it
 * refers to. Unknown item ids, duplicate decisions, a reject without
 * a reason, or an accept of an ambiguous item without a
 * chosenOccurrence that matches one of the item's occurrences all
 * refuse. Decisions are explicit: items without one stay pending.
 */
export function parseDecisionsFile(value: unknown, artifact: ReviewBatchArtifact): ReviewDecision[] {
  if (!isRecord(value)) {
    throw new LiveRunnerError("DECISIONS_INVALID", "decisions file is not a JSON object");
  }
  if (value.batchId !== artifact.batchId) {
    throw new LiveRunnerError(
      "DECISIONS_INVALID",
      `decisions batchId ${JSON.stringify(value.batchId)} does not match artifact batch ${JSON.stringify(artifact.batchId)}`,
    );
  }
  if (!Array.isArray(value.decisions)) {
    throw new LiveRunnerError("DECISIONS_INVALID", "decisions file needs a \"decisions\" array");
  }
  const byId = new Map(artifact.items.map((i) => [i.id, i] as const));
  const seen = new Set<string>();
  const decisions: ReviewDecision[] = [];
  for (const raw of value.decisions as unknown[]) {
    if (!isRecord(raw)) {
      throw new LiveRunnerError("DECISIONS_INVALID", "each decision must be an object");
    }
    const knownKeys = new Set([
      "itemId",
      "decision",
      "reason",
      "chosenOccurrence",
      "targetPromiseId",
      "confirmResolutionConflict",
    ]);
    for (const key of Object.keys(raw)) {
      if (!knownKeys.has(key)) {
        throw new LiveRunnerError("DECISIONS_INVALID", `decision has unknown field ${JSON.stringify(key)}`);
      }
    }
    if (typeof raw.itemId !== "string" || !byId.has(raw.itemId)) {
      throw new LiveRunnerError(
        "DECISIONS_INVALID",
        `decision refers to unknown item ${JSON.stringify(raw.itemId)}`,
      );
    }
    if (seen.has(raw.itemId)) {
      throw new LiveRunnerError("DECISIONS_INVALID", `duplicate decision for item ${raw.itemId}`);
    }
    seen.add(raw.itemId);
    if (raw.decision !== "accept" && raw.decision !== "reject") {
      throw new LiveRunnerError(
        "DECISIONS_INVALID",
        `decision for item ${raw.itemId} must be "accept" or "reject"`,
      );
    }
    const item = byId.get(raw.itemId) as ReviewItem;
    if (raw.decision === "reject") {
      if (typeof raw.reason !== "string" || raw.reason.trim().length === 0) {
        throw new LiveRunnerError(
          "DECISIONS_INVALID",
          `reject of item ${raw.itemId} requires a non-empty reason`,
        );
      }
    }
    let chosenOccurrence: [number, number] | undefined;
    if (raw.chosenOccurrence !== undefined) {
      if (
        !Array.isArray(raw.chosenOccurrence) ||
        raw.chosenOccurrence.length !== 2 ||
        !raw.chosenOccurrence.every((n) => typeof n === "number" && Number.isInteger(n))
      ) {
        throw new LiveRunnerError(
          "DECISIONS_INVALID",
          `chosenOccurrence for item ${raw.itemId} must be [start, end] integers`,
        );
      }
      chosenOccurrence = raw.chosenOccurrence as [number, number];
      const chosenPair: [number, number] = chosenOccurrence;
      const matches = item.evidence.some(
        (span) =>
          span.ambiguous &&
          span.occurrences.some(([s, e]) => s === chosenPair[0] && e === chosenPair[1]),
      );
      if (!matches) {
        throw new LiveRunnerError(
          "DECISIONS_INVALID",
          `chosenOccurrence [${chosenOccurrence[0]}, ${chosenOccurrence[1]}] for item ${raw.itemId} ` +
            `does not match any occurrence of an ambiguous quote on that item`,
        );
      }
    }
    if (raw.decision === "accept" && itemEvidenceStatus(item) === "ambiguous" && chosenOccurrence === undefined) {
      throw new LiveRunnerError(
        "DECISIONS_INVALID",
        `accept of ambiguous item ${raw.itemId} requires chosenOccurrence`,
      );
    }
    if (raw.decision === "accept" && itemEvidenceStatus(item) === "rejected") {
      throw new LiveRunnerError(
        "DECISIONS_INVALID",
        `accept of item ${raw.itemId} is impossible: its evidence did not verify (${item.verificationError ?? "rejected"})`,
      );
    }
    if (raw.targetPromiseId !== undefined && typeof raw.targetPromiseId !== "string") {
      throw new LiveRunnerError(
        "DECISIONS_INVALID",
        `targetPromiseId for item ${raw.itemId} must be a string`,
      );
    }
    if (
      raw.confirmResolutionConflict !== undefined &&
      typeof raw.confirmResolutionConflict !== "boolean"
    ) {
      throw new LiveRunnerError(
        "DECISIONS_INVALID",
        `confirmResolutionConflict for item ${raw.itemId} must be a boolean`,
      );
    }
    decisions.push({
      itemId: raw.itemId as string,
      decision: raw.decision,
      reason: typeof raw.reason === "string" ? raw.reason : undefined,
      chosenOccurrence,
      targetPromiseId: typeof raw.targetPromiseId === "string" ? raw.targetPromiseId : undefined,
      confirmResolutionConflict:
        typeof raw.confirmResolutionConflict === "boolean" ? raw.confirmResolutionConflict : undefined,
    });
  }
  return decisions;
}

/** Read and strictly validate a decisions file against its artifact. */
export function loadDecisionsFile(path: string, artifact: ReviewBatchArtifact): ReviewDecision[] {
  if (!existsSync(path)) {
    throw new LiveRunnerError("DECISIONS_INVALID", `no decisions file at ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch (error) {
    throw new LiveRunnerError(
      "DECISIONS_INVALID",
      `decisions file at ${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseDecisionsFile(parsed, artifact);
}

// ---------------------------------------------------------------------------
// 7. review-accept (2b): explicit decisions → commit → checker → snapshot.
// ---------------------------------------------------------------------------

export const FINDINGS_SCHEMA_VERSION = 1;

export interface FindingsArtifact {
  schemaVersion: 1;
  artifactKind: "checker-findings";
  batchId: string;
  artifactBatchId: string;
  chapterSeq: number;
  commitId: string | null;
  headCommitId: string | null;
  checkerSkipped: boolean;
  checkerSkippedReason: string | null;
  findings: Finding[];
  notes: CheckerNote[];
  createdAt: string;
}

export interface ReviewSummary {
  batchId: string;
  artifactBatchId: string;
  chapterSeq: number;
  chapterId: string;
  commitId: string | null;
  headCommitId: string | null;
  accepted: number;
  rejected: number;
  pending: number;
  findings: number;
  findingsByRule: Record<string, number>;
  findingsByConfidence: Record<string, number>;
  notes: number;
  checkerSkipped: boolean;
  storePath: string;
  findingsJsonPath: string;
  findingsMdPath: string;
}

export interface RunReviewAcceptArgs {
  artifactPath: string;
  storyPath: string;
  decisionsPath: string;
  storePath: string;
  outDir: string;
  storyTitle?: string | null;
  author?: string;
  now?: () => Date;
  /** Explicit alias -> canonical name map (human-supplied; never inferred). Passed to commitBatch. */
  characterAliases?: Record<string, string>;
}

function findingsFileNames(when: Date = new Date()): { json: string; md: string } {
  const slug = timestampSlug(when);
  return { json: `findings-${slug}.json`, md: `findings-${slug}.md` };
}

export function renderFindingsMarkdown(artifact: FindingsArtifact): string {
  const lines: string[] = [];
  lines.push(`# Checker findings — chapter ${artifact.chapterSeq}`);
  lines.push("");
  lines.push(`- Batch: ${artifact.batchId} (artifact ${artifact.artifactBatchId})`);
  lines.push(`- Commit: ${artifact.commitId ?? "— (nothing committed)"}`);
  lines.push(`- Head: ${artifact.headCommitId ?? "—"}`);
  if (artifact.checkerSkipped) {
    lines.push(`- Checker skipped: ${artifact.checkerSkippedReason ?? "no commit"}`);
  }
  lines.push(`- Findings: ${artifact.findings.length} (${artifact.findings.filter((f) => f.confidence === "confirmed").length} confirmed, ${artifact.findings.filter((f) => f.confidence === "uncertain").length} uncertain)`);
  lines.push(`- Notes: ${artifact.notes.length}`);
  lines.push("");
  for (const finding of artifact.findings) {
    lines.push(`## ${finding.ruleCode} — ${finding.confidence}`);
    lines.push("");
    lines.push(finding.description);
    if (finding.reason) lines.push(`Reason: ${finding.reason}`);
    lines.push(`Subjects: ${finding.subjects.join(", ")}`);
    for (const ev of finding.evidence) {
      lines.push(`- ${ev.role}: \`${ev.quote}\` (${ev.startOffset}–${ev.endOffset})`);
    }
    lines.push("");
  }
  for (const note of artifact.notes) {
    lines.push(`- Note (${note.type}): ${note.description}`);
  }
  lines.push("");
  lines.push(`Created: ${artifact.createdAt}`);
  return `${lines.join("\n")}\n`;
}

export function renderReviewSummaryText(summary: ReviewSummary): string {
  const lines: string[] = [];
  lines.push(`Chapter ${summary.chapterSeq} reviewed — batch ${summary.artifactBatchId}`);
  lines.push(`  accepted: ${summary.accepted}, rejected: ${summary.rejected}, pending: ${summary.pending}`);
  lines.push(
    `  commit: ${summary.commitId ?? "none (nothing accepted)"} — head ${summary.headCommitId ?? "—"}`,
  );
  if (summary.checkerSkipped) {
    lines.push(`  checker: skipped (nothing committed)`);
  } else {
    lines.push(
      `  checker: ${summary.findings} finding(s) ` +
        `(${summary.findingsByConfidence.confirmed ?? 0} confirmed, ${summary.findingsByConfidence.uncertain ?? 0} uncertain), ` +
        `${summary.notes} note(s)`,
    );
    for (const [rule, count] of Object.entries(summary.findingsByRule)) {
      lines.push(`    ${rule}: ${count}`);
    }
  }
  lines.push(`  store: ${summary.storePath}`);
  lines.push(`  findings: ${summary.findingsJsonPath}`);
  return `${lines.join("\n")}\n`;
}

/**
 * The full review-accept run (brief section 2b). Every input is
 * re-validated; the store snapshot is the durable truth and is only
 * written at the very end, after a successful commit (when any) and
 * checker run. A failure anywhere before the save leaves the
 * snapshot untouched, so the run can be retried from the same files.
 */
export function runReviewAccept(args: RunReviewAcceptArgs): ReviewSummary {
  const now = args.now ?? (() => new Date());
  const artifact = loadReviewBatchArtifact(args.artifactPath);
  if (!existsSync(args.storyPath)) {
    throw new LiveRunnerError("STORY_SHA_MISMATCH", `no story file at ${args.storyPath}`);
  }
  const storyBody = readFileSync(args.storyPath, "utf-8");
  const storySha = storySha256(storyBody);
  if (storySha !== artifact.bodySha256) {
    throw new LiveRunnerError(
      "STORY_SHA_MISMATCH",
      `story file SHA-256 ${storySha} differs from artifact story_sha256 ${artifact.bodySha256} — refusing; use the SAME story file as extraction`,
    );
  }
  const decisions = loadDecisionsFile(args.decisionsPath, artifact);

  // Load (or start) the durable store snapshot.
  let snapshot: StoreSnapshotV1 | null = null;
  try {
    snapshot = loadStoreSnapshotIfExists(args.storePath);
  } catch (error) {
    if (error instanceof Error && error.name === "StoreSnapshotError") {
      const code = (error as { code?: string }).code;
      if (code === "STORE_VERSION_UNKNOWN") {
        throw new LiveRunnerError("STORE_VERSION_UNKNOWN", error.message);
      }
      throw new LiveRunnerError("ARTIFACT_INVALID", `store snapshot is invalid: ${error.message}`);
    }
    throw error;
  }
  if (snapshot !== null) {
    const already = snapshot.reviewBatches.find((b) => b.artifactBatchId === artifact.batchId);
    if (already) {
      throw new LiveRunnerError(
        "ARTIFACT_INVALID",
        `batch ${artifact.batchId} was already reviewed and committed on ${already.committedAt} (commit ${already.commitId ?? "—"}) — refusing a second review of the same batch`,
      );
    }
  }

  const rehydrated = snapshot !== null ? rehydrateRepository(snapshot) : null;
  const repo = rehydrated !== null ? rehydrated.repo : new InMemoryStoryworldRepository();
  const project =
    rehydrated !== null
      ? rehydrated.project
      : repo.createProject(args.storyTitle ?? artifact.storyTitle ?? "Untitled story").project;
  const branch =
    rehydrated !== null
      ? rehydrated.branch
      : (repo.getMainBranch(project.id) as Branch);
  const localIdMaps = rehydrated !== null
    ? rehydrated.localIdMaps
    : { propositions: new Map<string, string>(), events: new Map<string, string>() };
  const reviewBatches: StoreSnapshotV1["reviewBatches"] =
    rehydrated !== null ? rehydrated.reviewBatches : [];

  // The chapter must not already exist in this store.
  if (repo.listChapters(branch.id).some((c) => c.seq === artifact.chapterSeq)) {
    throw new LiveRunnerError(
      "ARTIFACT_INVALID",
      `chapter seq ${artifact.chapterSeq} already exists in the store — refusing to review the same chapter twice`,
    );
  }

  // The chapter itself is a ledger commit (spec section 9).
  const { chapter, revision } = repo.createChapter(branch.id, {
    seq: artifact.chapterSeq,
    title: artifact.chapterTitle,
    body: storyBody,
    source: "human",
    expectedHead: repo.getHead(branch.id),
    author: args.author ?? "human",
  });

  // Rehydrate the review queue from the artifact's own output: this
  // re-validates the schema AND re-verifies every evidence span
  // against the story as it is NOW. A decision can only accept an
  // item that re-verifies here.
  const queue = new ReviewQueue();
  const batch = queue.createBatch({
    body: storyBody,
    output: artifact.extractorOutput,
    chapterRevisionId: revision.id,
    chapterSeq: artifact.chapterSeq,
    requireModality: artifact.extractor.promptVersion === "extractor.v4",
  });
  if (batch.bodySha256 !== artifact.bodySha256) {
    throw new LiveRunnerError(
      "ARTIFACT_INVALID",
      "rehydrated batch SHA-256 does not match the artifact — the artifact does not describe its own extractor output",
    );
  }
  if (batch.items.length !== artifact.items.length) {
    throw new LiveRunnerError(
      "ARTIFACT_INVALID",
      `rehydrated batch has ${batch.items.length} items but the artifact lists ${artifact.items.length} — the artifact was edited`,
    );
  }
  for (let i = 0; i < batch.items.length; i += 1) {
    const fresh = batch.items[i];
    const recorded = artifact.items[i];
    if (
      fresh.id !== recorded.id ||
      fresh.section !== recorded.section ||
      fresh.localId !== recorded.localId ||
      fresh.verificationError !== recorded.verificationError ||
      JSON.stringify(fresh.data) !== JSON.stringify(recorded.data)
    ) {
      throw new LiveRunnerError(
        "ARTIFACT_INVALID",
        `rehydrated item ${fresh.id} does not match the artifact — the artifact was edited`,
      );
    }
  }

  // Promise-resolution candidates come from the current projection:
  // the reviewer picks a real promise id, never an invented one.
  const candidates = projectState(repo.snapshot(branch.id)).promises.map((p) => ({
    id: p.id,
    currentStatus: p.currentStatus,
  }));

  // Apply the explicit decisions, in file order. Any failure aborts
  // before any commit happens.
  for (const decision of decisions) {
    const item = batch.items.find((i) => i.id === decision.itemId) as ReviewItem;
    try {
      if (decision.chosenOccurrence !== undefined) {
        const chosenPair: [number, number] = decision.chosenOccurrence;
        const evidenceIndex = item.evidence.findIndex(
          (span) =>
            span.ambiguous &&
            span.occurrences.some(([s, e]) => s === chosenPair[0] && e === chosenPair[1]),
        );
        if (evidenceIndex === -1) {
          throw new LiveRunnerError(
            "DECISIONS_INVALID",
            `chosenOccurrence for item ${decision.itemId} matches no ambiguous span`,
          );
        }
        const occurrenceIndex = item.evidence[evidenceIndex].occurrences.findIndex(
          ([s, e]) => s === chosenPair[0] && e === chosenPair[1],
        );
        queue.resolveAmbiguity(batch.id, decision.itemId, evidenceIndex, occurrenceIndex);
      }
      if (decision.targetPromiseId !== undefined) {
        queue.selectPromiseTarget(batch.id, decision.itemId, decision.targetPromiseId, candidates);
      }
      if (decision.confirmResolutionConflict === true) {
        queue.confirmResolutionConflict(batch.id, decision.itemId);
      }
      if (decision.decision === "accept") {
        queue.accept(batch.id, decision.itemId);
      } else {
        queue.reject(batch.id, decision.itemId, decision.reason as string);
      }
    } catch (error) {
      if (error instanceof LiveRunnerError) throw error;
      throw new LiveRunnerError(
        "DECISIONS_INVALID",
        `decision for item ${decision.itemId} cannot be applied: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const acceptedCount = batch.items.filter((i) => i.status === "accepted").length;
  const rejectedCount = batch.items.filter((i) => i.status === "rejected").length;
  const pendingCount = batch.items.filter((i) => i.status === "pending").length;

  // Commit only when something was accepted — commitBatch would
  // otherwise write an empty commit. No automatic commits: the
  // accepted set is exactly the human's explicit decisions.
  let commitId: string | null = null;
  if (acceptedCount > 0) {
    let commitResult: ReturnType<typeof commitBatch>;
    try {
      commitResult = commitBatch(queue, batch.id, repo, {
        branchId: branch.id,
        expectedHead: repo.getHead(branch.id),
        author: args.author ?? "human",
        knownPropositions: localIdMaps.propositions,
        knownEvents: localIdMaps.events,
        ...(args.characterAliases ? { characterAliases: args.characterAliases } : {}),
      });
    } catch (error) {
      throw new LiveRunnerError(
        "VALIDATION_FAILED",
        `commit failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    commitId = commitResult.commit.id;
    for (const [localId, realId] of commitResult.mappings.propositions) {
      localIdMaps.propositions.set(localId, realId);
    }
    for (const [localId, realId] of commitResult.mappings.events) {
      localIdMaps.events.set(localId, realId);
    }
  }

  // The checker runs on projections AFTER acceptance.
  let findings: Finding[] = [];
  let notes: CheckerNote[] = [];
  let checkerSkipped = false;
  if (commitId !== null) {
    const result = runCheckerDetailed(repo, branch.id, {});
    findings = result.findings;
    notes = result.notes;
  } else {
    checkerSkipped = true;
  }

  // Durable snapshot: store + review statuses, written only now.
  const when = now();
  reviewBatches.push({
    batchId: batch.id,
    artifactBatchId: artifact.batchId,
    chapterSeq: artifact.chapterSeq,
    bodySha256: artifact.bodySha256,
    committedAt: when.toISOString(),
    commitId,
    items: batch.items.map((i) => ({
      id: i.id,
      section: i.section,
      localId: i.localId,
      status: i.status,
      rejectReason: i.rejectReason,
    })),
  });
  mkdirSync(dirname(args.storePath), { recursive: true });
  saveStoreSnapshot(
    { repo, projectId: project.id, branchId: branch.id, localIdMaps, reviewBatches },
    args.storePath,
  );

  // Findings artifact (written even when the checker was skipped).
  const findingsArtifact: FindingsArtifact = {
    schemaVersion: FINDINGS_SCHEMA_VERSION,
    artifactKind: "checker-findings",
    batchId: batch.id,
    artifactBatchId: artifact.batchId,
    chapterSeq: artifact.chapterSeq,
    commitId,
    headCommitId: repo.getHead(branch.id),
    checkerSkipped,
    checkerSkippedReason: checkerSkipped ? "nothing accepted, so no commit; checker runs after acceptance" : null,
    findings,
    notes,
    createdAt: when.toISOString(),
  };
  mkdirSync(args.outDir, { recursive: true });
  const names = findingsFileNames(when);
  const findingsJsonPath = join(args.outDir, names.json);
  const findingsMdPath = join(args.outDir, names.md);
  writeFileSync(findingsJsonPath, `${JSON.stringify(findingsArtifact, null, 2)}\n`, "utf-8");
  writeFileSync(findingsMdPath, renderFindingsMarkdown(findingsArtifact), "utf-8");

  const findingsByRule: Record<string, number> = {};
  const findingsByConfidence: Record<string, number> = {};
  for (const f of findings) {
    const ruleKey = f.ruleCode ?? "(no rule)";
    findingsByRule[ruleKey] = (findingsByRule[ruleKey] ?? 0) + 1;
    findingsByConfidence[f.confidence] = (findingsByConfidence[f.confidence] ?? 0) + 1;
  }
  return {
    batchId: batch.id,
    artifactBatchId: artifact.batchId,
    chapterSeq: artifact.chapterSeq,
    chapterId: chapter.id,
    commitId,
    headCommitId: repo.getHead(branch.id),
    accepted: acceptedCount,
    rejected: rejectedCount,
    pending: pendingCount,
    findings: findings.length,
    findingsByRule,
    findingsByConfidence,
    notes: notes.length,
    checkerSkipped,
    storePath: args.storePath,
    findingsJsonPath,
    findingsMdPath,
  };
}

// ---------------------------------------------------------------------------
// 8. CLI argument parsing (pure; the scripts are thin wrappers).
// ---------------------------------------------------------------------------

/**
 * Story-order timeline of events already COMMITTED in a durable store (i.e.
 * accepted by a reviewer). Empty when the store does not exist yet.
 */
export function priorTimelineFromStore(
  storePath: string,
): Array<{ summary: string; spanStart: number | null; spanEnd: number | null }> {
  const snapshot = loadStoreSnapshotIfExists(storePath);
  if (snapshot === null) return [];
  const { repo, branch } = rehydrateRepository(snapshot);
  return projectState(repo.snapshot(branch.id)).events.map((e) => ({
    summary: e.summary,
    spanStart: e.spanStart,
    spanEnd: e.spanEnd,
  }));
}

/** Read an explicit alias map: a JSON object of non-empty strings, no alias that is also a canonical target. */
export function loadAliasesFile(path: string): Record<string, string> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    throw new LiveRunnerError("VALIDATION_FAILED", `aliases file ${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new LiveRunnerError("VALIDATION_FAILED", "aliases file must be a JSON object of alias -> canonical name");
  }
  // Null-prototype record: a JSON "__proto__" key is an ordinary own entry here, and is rejected below anyway.
  const out: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [alias, canonical] of Object.entries(raw as Record<string, unknown>)) {
    if (alias === "__proto__" || alias === "constructor" || alias === "prototype") {
      throw new LiveRunnerError("VALIDATION_FAILED", `aliases key ${JSON.stringify(alias)} is reserved and not allowed`);
    }
    if (alias.trim() === "" || typeof canonical !== "string" || canonical.trim() === "") {
      throw new LiveRunnerError("VALIDATION_FAILED", `aliases entry ${JSON.stringify(alias)} must map to a non-empty string`);
    }
    out[alias] = canonical;
  }
  for (const target of Object.values(out)) {
    if (target === "__proto__" || target === "constructor" || target === "prototype") {
      throw new LiveRunnerError("VALIDATION_FAILED", `aliases canonical name ${JSON.stringify(target)} is reserved and not allowed`);
    }
    if (Object.prototype.hasOwnProperty.call(out, target) && out[target] !== target) {
      throw new LiveRunnerError("VALIDATION_FAILED", `alias chain: ${JSON.stringify(target)} is both a canonical name and an alias`);
    }
  }
  return out;
}

export interface ExtractionCliArgs {
  file: string;
  chapterSeq: number;
  mode: ExtractionMode;
  privacyConfirmed: boolean;
  outDir: string | null;
  storyTitle: string | null;
  storyOrderBase: number;
  /** Owner-approved attempt id; required for --live. */
  attemptId: string | null;
  /** Extractor profile version; default extractor.v3. */
  extractorVersion: string;
  /** Per-run dispatch cap (1..3); null = default 3. */
  maxDispatches: number | null;
  /** Durable store whose committed events become the prior timeline; null = none. */
  store: string | null;
}

export function parseExtractionArgs(argv: string[]): ExtractionCliArgs {
  const args: ExtractionCliArgs = {
    file: "",
    chapterSeq: 1,
    mode: "mock",
    privacyConfirmed: false,
    outDir: null,
    storyTitle: null,
    storyOrderBase: 0,
    attemptId: null,
    extractorVersion: "extractor.v3",
    maxDispatches: null,
    store: null,
  };
  let sawMock = false;
  let sawLive = false;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new LiveRunnerError("VALIDATION_FAILED", `flag ${flag} needs a value`);
      }
      i += 1;
      return value;
    };
    switch (flag) {
      case "--file":
        args.file = next();
        break;
      case "--store":
        args.store = next();
        break;
      case "--chapter-seq": {
        const n = Number(next());
        if (!Number.isInteger(n) || n < 1) {
          throw new LiveRunnerError("VALIDATION_FAILED", "--chapter-seq must be a positive integer");
        }
        args.chapterSeq = n;
        break;
      }
      case "--mock":
        sawMock = true;
        args.mode = "mock";
        break;
      case "--live":
        sawLive = true;
        args.mode = "live";
        break;
      case "--privacy-confirmed":
        args.privacyConfirmed = true;
        break;
      case "--attempt-id":
        args.attemptId = next();
        break;
      case "--out":
        args.outDir = next();
        break;
      case "--extractor": {
        const v = next();
        getExtractorProfile(v); // throws on unknown
        args.extractorVersion = v;
        break;
      }
      case "--max-dispatches": {
        const n = Number(next());
        if (!Number.isInteger(n) || n < 1 || n > MAX_CHAT_DISPATCHES) {
          throw new LiveRunnerError("VALIDATION_FAILED", `--max-dispatches must be an integer in 1..${MAX_CHAT_DISPATCHES}`);
        }
        args.maxDispatches = n;
        break;
      }
      case "--title":
        args.storyTitle = next();
        break;
      case "--story-order-base": {
        const n = Number(next());
        if (!Number.isInteger(n) || n < 0) {
          throw new LiveRunnerError("VALIDATION_FAILED", "--story-order-base must be a non-negative integer");
        }
        args.storyOrderBase = n;
        break;
      }
      default:
        throw new LiveRunnerError("VALIDATION_FAILED", `unknown flag ${JSON.stringify(flag)}`);
    }
  }
  if (sawMock && sawLive) {
    throw new LiveRunnerError("VALIDATION_FAILED", "specify exactly one of --mock or --live");
  }
  if (args.file.length === 0) {
    throw new LiveRunnerError("VALIDATION_FAILED", "--file <path> is required");
  }
  if (args.mode === "live" && !args.privacyConfirmed) {
    throw new LiveRunnerError(
      "PRIVACY_NOT_CONFIRMED",
      "--live refuses without --privacy-confirmed: attest that the section 4 privacy preconditions were checked today",
    );
  }
  if (args.mode === "live" && (args.attemptId === null || args.attemptId.length === 0)) {
    throw new LiveRunnerError(
      "ATTEMPT_ID_INVALID",
      "--live refuses without --attempt-id: every live run needs an owner-approved attempt id " +
        "so its dispatch budget persists across invocations",
    );
  }
  return args;
}

export interface ReviewAcceptCliArgs {
  batch: string;
  story: string;
  store: string | null;
  decisions: string;
  outDir: string | null;
  author: string | null;
  /** Path of an explicit alias map JSON; null = none. */
  aliases: string | null;
}

export function parseReviewAcceptArgs(argv: string[]): ReviewAcceptCliArgs {
  const args: ReviewAcceptCliArgs = {
    batch: "",
    story: "",
    store: null,
    decisions: "",
    outDir: null,
    author: null,
    aliases: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new LiveRunnerError("VALIDATION_FAILED", `flag ${flag} needs a value`);
      }
      i += 1;
      return value;
    };
    switch (flag) {
      case "--batch":
        args.batch = next();
        break;
      case "--story":
        args.story = next();
        break;
      case "--store":
        args.store = next();
        break;
      case "--decisions":
        args.decisions = next();
        break;
      case "--out":
        args.outDir = next();
        break;
      case "--author":
        args.author = next();
        break;
      case "--aliases":
        args.aliases = next();
        break;
      default:
        throw new LiveRunnerError("VALIDATION_FAILED", `unknown flag ${JSON.stringify(flag)}`);
    }
  }
  if (args.batch.length === 0) throw new LiveRunnerError("VALIDATION_FAILED", "--batch <path> is required");
  if (args.story.length === 0) throw new LiveRunnerError("VALIDATION_FAILED", "--story <path> is required");
  if (args.decisions.length === 0) {
    throw new LiveRunnerError("VALIDATION_FAILED", "--decisions <path> is required");
  }
  return args;
}
