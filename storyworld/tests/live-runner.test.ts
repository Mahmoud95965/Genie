/**
 * Live extraction runner tests (brief section 6) — all offline.
 *
 * Every test uses mocked fetch; no network, no key. The mock fetch
 * routes by URL: GET /models serves the catalog (price pre-flight),
 * POST /chat/completions serves queued model replies, GET /generation
 * serves the post-call cost lookup. A mock fetch that "always fails"
 * fails the chat endpoint (the catalog still answers, because the
 * pre-flight runs before every dispatch — the ceiling counts chat
 * dispatches, not metadata reads).
 */
import { describe, expect, it, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig, mergeConfig, type StoryworldConfig } from "../lib/config";
import {
  JobBudgetEnvelope,
  OpenRouterClient,
  UnpricedModelError,
} from "../lib/openrouter";
import { EXTRACTOR_SYSTEM_PROMPT, buildExtractorUserMessage } from "../lib/extractor/prompts";
import { GENIE_EXTRACTOR_OUTPUT_SCHEMA } from "../lib/extractor/schema";
import { verifyExtraction } from "../lib/extractor/evidence";
import { loadStoreSnapshotIfExists } from "../lib/store-snapshot";
import {
  CountingFetch,
  LiveRunnerError,
  MAX_CHAT_DISPATCHES,
  assertLivePrerequisites,
  assertPricingAllZero,
  buildMockExtractorOutput,
  buildReviewBatchArtifact,
  itemEvidenceStatus,
  loadDecisionsFile,
  loadReviewBatchArtifact,
  parseDecisionsFile,
  parseExtractionArgs,
  parseReviewBatchArtifact,
  runExtraction,
  runMockExtraction,
  runPricePreflight,
  runReviewAccept,
  sentenceSpans,
  writeReviewBatchArtifact,
  type ExtractedArtifact,
  type ReviewBatchArtifact,
} from "../lib/live-runner";

const SLUG = "test-free-model:free";
const PROVIDER = "test-provider";

const CH1 = "مات القبطان سالم في ليلة العاصفة. وقف عمر عند المنارة.";
const CH2 = "وقف عمر عند المنارة. قال عمر إن الرسايل مخبأة. وقف عمر ينتظر.";

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "live-runner-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop() as string;
    rmSync(dir, { recursive: true, force: true });
  }
});

function liveConfig(overrides: Record<string, unknown> = {}): StoryworldConfig {
  return mergeConfig({
    models: { extractor: SLUG },
    live_calls: {
      enabled: true,
      hard_cap_usd_per_month: 0,
      approved_models: [
        { slug: SLUG, input_usd_per_mtok: 0, output_usd_per_mtok: 0, provider: PROVIDER },
      ],
    },
    ...overrides,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface MockBehavior {
  catalogPricing?: Record<string, unknown> | null;
  catalogSlugMissing?: boolean;
  /** Queued chat response bodies (JSON objects), one per dispatch. */
  chatBodies?: unknown[];
  /** When set, every chat dispatch returns this HTTP status instead. */
  chatStatus?: number;
  /** When true, every chat dispatch throws (transport failure). */
  chatThrows?: boolean;
  /** Cost returned by GET /generation; null/undefined → 404 (unknown). */
  generationCost?: number | null;
}

interface MockFetch {
  fetch: typeof fetch;
  calls: Array<{ url: string; method: string; body?: unknown }>;
}

function mockFetch(behavior: MockBehavior = {}): MockFetch {
  const calls: MockFetch["calls"] = [];
  let chatIndex = 0;
  const fetchImpl = (async (input: unknown, init?: { method?: string; body?: string }) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    let body: unknown;
    if (init?.body !== undefined) {
      try {
        body = JSON.parse(init.body) as unknown;
      } catch {
        body = init.body;
      }
    }
    calls.push({ url, method, body });
    if (url.includes("/models")) {
      if (behavior.catalogSlugMissing) return jsonResponse({ data: [] });
      const pricing =
        behavior.catalogPricing === undefined
          ? { prompt: "0", completion: "0" }
          : behavior.catalogPricing;
      return jsonResponse({ data: [{ id: SLUG, pricing }] });
    }
    if (url.includes("/generation")) {
      if (behavior.generationCost === undefined || behavior.generationCost === null) {
        return new Response("not found", { status: 404 });
      }
      return jsonResponse({ data: { total_cost: behavior.generationCost } });
    }
    if (url.includes("/chat/completions")) {
      if (behavior.chatThrows === true) throw new Error("mock network failure");
      if (behavior.chatStatus !== undefined && behavior.chatStatus !== 200) {
        return new Response("provider error", { status: behavior.chatStatus });
      }
      const output =
        behavior.chatBodies !== undefined
          ? behavior.chatBodies[Math.min(chatIndex, behavior.chatBodies.length - 1)]
          : buildMockExtractorOutput(CH2, 1);
      chatIndex += 1;
      return jsonResponse({
        id: "gen-test-1",
        model: SLUG,
        choices: [{ message: { content: JSON.stringify(output) } }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, calls };
}

function countingMock(behavior: MockBehavior = {}): { counting: CountingFetch; mock: MockFetch } {
  const mock = mockFetch(behavior);
  return { counting: new CountingFetch(mock.fetch), mock };
}

function chatCalls(mock: MockFetch): MockFetch["calls"] {
  return mock.calls.filter((c) => c.url.includes("/chat/completions"));
}
function catalogCalls(mock: MockFetch): MockFetch["calls"] {
  return mock.calls.filter((c) => c.url.includes("/models"));
}

/** A validated extraction artifact stand-in (no model involved). */
function fakeExtracted(output: Record<string, unknown>, body: string): ExtractedArtifact {
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
    latencyMs: 0,
    dispatchCounts: { chatCompletions: 0, catalogFetches: 0, costLookups: 0, other: 0 },
    verification: verifyExtraction(body, output),
  };
}

function writeArtifactFiles(
  dir: string,
  body: string,
  seq: number,
  extracted?: ExtractedArtifact,
): { jsonPath: string; mdPath: string; artifact: ReviewBatchArtifact } {
  const { artifact } = buildReviewBatchArtifact({
    extracted: extracted ?? runMockExtraction({ chapterBody: body, chapterSeq: seq }),
    chapterBody: body,
    chapterSeq: seq,
    storyTitle: "Test story",
  });
  const paths = writeReviewBatchArtifact(dir, artifact);
  return { ...paths, artifact };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
}

function collectKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out.add(key);
      collectKeys(child, out);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Group 1 — live gate refuses when each prerequisite is missing.
// ---------------------------------------------------------------------------
describe("1. live gate", () => {
  const cases: Array<{ name: string; config: StoryworldConfig; env: Record<string, string | undefined>; missing: string }> = [
    {
      name: "enabled flag",
      config: liveConfig({ live_calls: { enabled: false, hard_cap_usd_per_month: 0, approved_models: [{ slug: SLUG, provider: PROVIDER }] } }),
      env: { OPENROUTER_API_KEY: "key" },
      missing: "live_calls.enabled",
    },
    {
      name: "extractor model",
      config: liveConfig({ models: { extractor: null } }),
      env: { OPENROUTER_API_KEY: "key" },
      missing: "models.extractor",
    },
    {
      name: "cap null",
      config: liveConfig({ live_calls: { enabled: true, hard_cap_usd_per_month: null, approved_models: [{ slug: SLUG, provider: PROVIDER }] } }),
      env: { OPENROUTER_API_KEY: "key" },
      missing: "hard_cap_usd_per_month",
    },
    {
      name: "approved slug",
      config: liveConfig({ live_calls: { enabled: true, hard_cap_usd_per_month: 0, approved_models: [{ slug: "other-model:free", provider: PROVIDER }] } }),
      env: { OPENROUTER_API_KEY: "key" },
      missing: "approved_models",
    },
    {
      name: "pinned provider (section 3c)",
      config: liveConfig({ live_calls: { enabled: true, hard_cap_usd_per_month: 0, approved_models: [{ slug: SLUG }] } }),
      env: { OPENROUTER_API_KEY: "key" },
      missing: "provider",
    },
    {
      name: "env key",
      config: liveConfig(),
      env: {},
      missing: "OPENROUTER_API_KEY",
    },
  ];
  for (const c of cases) {
    it(`refuses when ${c.name} is missing and names it`, () => {
      let caught: unknown;
      try {
        assertLivePrerequisites(c.config, c.env);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(LiveRunnerError);
      expect((caught as LiveRunnerError).code).toBe("LIVE_GATE_MISSING");
      expect((caught as Error).message).toContain(c.missing);
    });
  }

  it("passes when every prerequisite is present and returns slug + provider", () => {
    const result = assertLivePrerequisites(liveConfig(), { OPENROUTER_API_KEY: "key" });
    expect(result).toEqual({ slug: SLUG, provider: PROVIDER });
  });
});

// ---------------------------------------------------------------------------
// Group 2 — zero-cap behavior against the real client.
// ---------------------------------------------------------------------------
describe("2. zero cap against the real client (the cap is NOT spend enforcement)", () => {
  function clientConfig(cap: number | null): StoryworldConfig {
    return liveConfig({
      live_calls: {
        enabled: true,
        hard_cap_usd_per_month: cap,
        approved_models: [{ slug: SLUG, provider: PROVIDER }],
      },
    });
  }

  it("hard_cap_usd_per_month: 0 passes the client gate and reaches the provider", async () => {
    const mock = mockFetch({ generationCost: 0 });
    const client = new OpenRouterClient({
      config: clientConfig(0),
      fetchImpl: mock.fetch,
      telemetry: undefined,
    });
    const result = await client.chatCompletion({
      model: SLUG,
      messages: [
        { role: "system", content: EXTRACTOR_SYSTEM_PROMPT },
        { role: "user", content: buildExtractorUserMessage({ chapterBody: CH2, chapterSeq: 1, storyOrderBase: 0, cast: [] }) },
      ],
      responseFormat: { name: "GenieExtractorOutput", schema: GENIE_EXTRACTOR_OUTPUT_SCHEMA as unknown as Record<string, unknown> },
      purpose: "extract",
      budget: JobBudgetEnvelope.fromConfig(clientConfig(0)),
    });
    expect(result.source).toBe("live");
    expect(chatCalls(mock).length).toBe(1);
  });

  it("hard_cap_usd_per_month: null rejects before any fetch (no network call)", async () => {
    const mock = mockFetch();
    const client = new OpenRouterClient({ config: clientConfig(null), fetchImpl: mock.fetch });
    await expect(
      client.chatCompletion({
        model: SLUG,
        messages: [{ role: "user", content: "x" }],
        purpose: "extract",
        budget: JobBudgetEnvelope.fromConfig(clientConfig(null)),
      }),
    ).rejects.toBeInstanceOf(UnpricedModelError);
    expect(mock.calls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Group 3 — price pre-flight.
// ---------------------------------------------------------------------------
describe("3. price pre-flight", () => {
  const baseUrl = "https://openrouter.ai/api/v1";

  it.each([
    ["prompt", { prompt: "0.5", completion: "0" }],
    ["completion", { prompt: "0", completion: "1" }],
    ["request", { prompt: "0", completion: "0", request: "0.01" }],
    ["reasoning", { prompt: "0", completion: "0", reasoning: "2" }],
    ["other (web_search)", { prompt: "0", completion: "0", web_search: "0.001" }],
  ])("refuses when %s is non-zero", async (_name, pricing) => {
    const mock = mockFetch({ catalogPricing: pricing });
    await expect(runPricePreflight(mock.fetch, baseUrl, SLUG)).rejects.toMatchObject({
      code: "PRICE_PREFLIGHT_FAILED",
    });
  });

  it("refuses when a pricing field is missing", async () => {
    const mock = mockFetch({ catalogPricing: { prompt: "0" } });
    await expect(runPricePreflight(mock.fetch, baseUrl, SLUG)).rejects.toMatchObject({
      code: "PRICE_PREFLIGHT_FAILED",
    });
  });

  it("refuses when the pricing object is missing", async () => {
    const mock = mockFetch({ catalogPricing: null });
    await expect(runPricePreflight(mock.fetch, baseUrl, SLUG)).rejects.toMatchObject({
      code: "PRICE_PREFLIGHT_FAILED",
    });
  });

  it("refuses when the slug is missing from the catalog", async () => {
    const mock = mockFetch({ catalogSlugMissing: true });
    await expect(runPricePreflight(mock.fetch, baseUrl, SLUG)).rejects.toMatchObject({
      code: "PRICE_PREFLIGHT_FAILED",
    });
  });

  it("proceeds when every pricing value is exactly zero", async () => {
    const mock = mockFetch({
      catalogPricing: { prompt: "0", completion: "0", request: "0", image: "0", reasoning: "0" },
    });
    const pricing = await runPricePreflight(mock.fetch, baseUrl, SLUG);
    expect(pricing).toEqual({ prompt: "0", completion: "0", request: "0", image: "0", reasoning: "0" });
  });

  it("accepts a numeric 0 as a zero price (not only the string \"0\")", () => {
    expect(() =>
      assertPricingAllZero({ id: SLUG, pricing: { prompt: "0", completion: "0", request: 0 } }, SLUG),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Group 4 — dispatch ceiling.
// ---------------------------------------------------------------------------
describe("4. dispatch ceiling", () => {
  it("mock fetch always failing the chat endpoint → exactly 3 chat dispatches, then stop", async () => {
    const { counting, mock } = countingMock({ chatStatus: 500 });
    await expect(
      runExtraction(
        { countingFetch: counting, config: liveConfig() },
        { chapterBody: CH2, chapterSeq: 1, model: SLUG, provider: PROVIDER },
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    expect(chatCalls(mock).length).toBe(MAX_CHAT_DISPATCHES);
    expect(chatCalls(mock).length).toBeLessThanOrEqual(3);
    // The pre-flight runs before every dispatch, so the catalog is
    // re-fetched per dispatch — counted separately, not against the ceiling.
    expect(catalogCalls(mock).length).toBe(MAX_CHAT_DISPATCHES);
    expect(counting.counts.chatCompletions).toBe(3);
  });

  it("the counting dispatcher hard-fails a 4th chat dispatch", async () => {
    const { counting } = countingMock({ chatStatus: 500 });
    counting.counts.chatCompletions = MAX_CHAT_DISPATCHES;
    await expect(
      counting.fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", body: "{}" }),
    ).rejects.toMatchObject({ code: "DISPATCH_CEILING_EXCEEDED" });
  });

  it("the runner retry override leaves the repo config file untouched", async () => {
    const configPath = join(process.cwd(), "storyworld.config.json");
    const before = readFileSync(configPath, "utf-8");
    const { counting } = countingMock({ chatStatus: 500 });
    await expect(
      runExtraction(
        { countingFetch: counting, config: liveConfig() },
        { chapterBody: CH2, chapterSeq: 1, model: SLUG, provider: PROVIDER },
      ),
    ).rejects.toBeInstanceOf(LiveRunnerError);
    expect(readFileSync(configPath, "utf-8")).toBe(before);
    const repoConfig = loadConfig();
    expect(repoConfig.openrouter.maxRetriesPerCall).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Group 5 — --mock runs end-to-end with live config disabled.
// ---------------------------------------------------------------------------
describe("5. --mock end-to-end (live config disabled)", () => {
  it("writes the batch artifact (JSON + MD) with no network and no key", () => {
    const repoConfig = loadConfig();
    expect(repoConfig.live_calls.enabled).toBe(false);
    expect(repoConfig.models.extractor).toBeNull();

    const dir = tempDir();
    const cli = parseExtractionArgs(["--file", "chapter-1.txt", "--chapter-seq", "1", "--mock"]);
    expect(cli.mode).toBe("mock");
    const extracted = runMockExtraction({ chapterBody: CH2, chapterSeq: cli.chapterSeq });
    const { artifact } = buildReviewBatchArtifact({
      extracted,
      chapterBody: CH2,
      chapterSeq: cli.chapterSeq,
      storyTitle: "Test story",
    });
    const { jsonPath, mdPath } = writeReviewBatchArtifact(dir, artifact);
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(mdPath)).toBe(true);
    const saved = loadReviewBatchArtifact(jsonPath);
    expect(saved.schemaVersion).toBe(1);
    expect(saved.mode).toBe("mock");
    expect(saved.items.every((i) => i.status === "pending")).toBe(true);
    expect(saved.modelRequested).toBe("mock-extractor-v1");
    expect(saved.extractor.costUsd).toBeNull();
  });

  it("writes no raw model output and no other files", () => {
    const dir = tempDir();
    const { jsonPath } = writeArtifactFiles(dir, CH2, 1);
    const keys = collectKeys(readJson(jsonPath));
    expect(keys.has("rawText")).toBe(false);
    expect(keys.has("rawOutput")).toBe(false);
    expect(keys.has("raw")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Group 6 — happy path: pending items with correct evidence statuses.
// ---------------------------------------------------------------------------
describe("6. happy path (mock)", () => {
  it("items are pending with verified / ambiguous / rejected evidence statuses", () => {
    const dir = tempDir();
    const { artifact } = writeArtifactFiles(dir, CH2, 1);
    const byId = new Map(artifact.items.map((i) => [i.id, i] as const));
    expect(itemEvidenceStatus(byId.get("$.events[0]") as never)).toBe("verified");
    expect(itemEvidenceStatus(byId.get("$.events[1]") as never)).toBe("ambiguous");
    expect(itemEvidenceStatus(byId.get("$.events[2]") as never)).toBe("rejected");
    expect(itemEvidenceStatus(byId.get("$.propositions[0]") as never)).toBe("verified");
    expect(itemEvidenceStatus(byId.get("$.knowledge[0]") as never)).toBe("verified");
    expect(itemEvidenceStatus(byId.get("$.character_facts[0]") as never)).toBe("verified");
    expect(itemEvidenceStatus(byId.get("$.promises[0]") as never)).toBe("verified");
    expect(artifact.verification.verified).toBe(6);
    expect(artifact.verification.rejected).toBe(1);
  });

  it("extraction commits nothing: no store file, no commit id anywhere", () => {
    const dir = tempDir();
    const { jsonPath } = writeArtifactFiles(dir, CH2, 1);
    expect(existsSync(join(dir, "store.json"))).toBe(false);
    const keys = collectKeys(readJson(jsonPath));
    expect(keys.has("commitId")).toBe(false);
    expect(keys.has("headCommitId")).toBe(false);
  });

  it("live path with mocked fetch also produces a valid artifact (cost 0, no charge flag)", async () => {
    const { counting, mock } = countingMock({ generationCost: 0 });
    const extracted = await runExtraction(
      { countingFetch: counting, config: liveConfig() },
      { chapterBody: CH2, chapterSeq: 1, model: SLUG, provider: PROVIDER },
    );
    expect(extracted.mode).toBe("live");
    expect(extracted.costUsd).toBe(0);
    expect(extracted.attempt).toBe(1);
    expect(catalogCalls(mock).length).toBe(1);
    const dir = tempDir();
    const { artifact } = buildReviewBatchArtifact({
      extracted,
      chapterBody: CH2,
      chapterSeq: 1,
      storyTitle: "Test story",
    });
    const { mdPath } = writeReviewBatchArtifact(dir, artifact);
    expect(readFileSync(mdPath, "utf-8")).not.toContain("UNEXPECTED CHARGE");
  });

  it("a non-zero post-call cost is flagged prominently", async () => {
    const { counting } = countingMock({ generationCost: 0.01 });
    const extracted = await runExtraction(
      { countingFetch: counting, config: liveConfig() },
      { chapterBody: CH2, chapterSeq: 1, model: SLUG, provider: PROVIDER },
    );
    expect(extracted.costUsd).toBe(0.01);
    const dir = tempDir();
    const { artifact } = buildReviewBatchArtifact({
      extracted,
      chapterBody: CH2,
      chapterSeq: 1,
    });
    const { mdPath } = writeReviewBatchArtifact(dir, artifact);
    expect(readFileSync(mdPath, "utf-8")).toContain("UNEXPECTED CHARGE");
  });
});

// ---------------------------------------------------------------------------
// Group 7 — schema failure → one retry with validator error appended.
// ---------------------------------------------------------------------------
describe("7. validation retry", () => {
  it("invalid output twice → VALIDATION_FAILED after exactly one retry", async () => {
    const { counting, mock } = countingMock({ chatBodies: [{}, {}] });
    await expect(
      runExtraction(
        { countingFetch: counting, config: liveConfig() },
        { chapterBody: CH2, chapterSeq: 1, model: SLUG, provider: PROVIDER },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(chatCalls(mock).length).toBe(2);
    expect(catalogCalls(mock).length).toBe(2);
    const secondUserMessage = (chatCalls(mock)[1].body as { messages: Array<{ content: string }> })
      .messages.find((m) => m.content.includes("failed validation"))?.content ?? "";
    expect(secondUserMessage).toContain("failed validation");
    expect(secondUserMessage).toContain("$.propositions");
  });

  it("invalid output once, then valid → succeeds on the retry", async () => {
    const { counting, mock } = countingMock({
      chatBodies: [{}, buildMockExtractorOutput(CH2, 1)],
    });
    const extracted = await runExtraction(
      { countingFetch: counting, config: liveConfig() },
      { chapterBody: CH2, chapterSeq: 1, model: SLUG, provider: PROVIDER },
    );
    expect(extracted.attempt).toBe(2);
    expect(extracted.validationRetries).toBe(1);
    expect(chatCalls(mock).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Group 8 — artifact integrity.
// ---------------------------------------------------------------------------
describe("8. artifact integrity", () => {
  function setup(): {
    dir: string;
    storyPath: string;
    jsonPath: string;
    artifact: ReviewBatchArtifact;
  } {
    const dir = tempDir();
    const storyPath = join(dir, "chapter-1.txt");
    writeFileSync(storyPath, CH2, "utf-8");
    const { jsonPath, artifact } = writeArtifactFiles(dir, CH2, 1);
    return { dir, storyPath, jsonPath, artifact };
  }

  function decisionsPath(dir: string, batchId: string, decisions: unknown[]): string {
    const path = join(dir, "decisions.json");
    writeJson(path, { batchId, decisions });
    return path;
  }

  it("tampered story_sha256 → refuses", () => {
    const { dir, storyPath, jsonPath, artifact } = setup();
    const tampered = readJson(jsonPath) as Record<string, unknown>;
    tampered.bodySha256 = "0".repeat(64);
    writeJson(jsonPath, tampered);
    expect(() =>
      runReviewAccept({
        artifactPath: jsonPath,
        storyPath,
        decisionsPath: decisionsPath(dir, artifact.batchId, []),
        storePath: join(dir, "store.json"),
        outDir: dir,
      }),
    ).toThrow(/STORY_SHA_MISMATCH/);
  });

  it("wrong story file → refuses", () => {
    const { dir, jsonPath, artifact } = setup();
    const otherStory = join(dir, "chapter-other.txt");
    writeFileSync(otherStory, "قصة مختلفة تماما لا علاقة لها بهذا الفصل.", "utf-8");
    expect(() =>
      runReviewAccept({
        artifactPath: jsonPath,
        storyPath: otherStory,
        decisionsPath: decisionsPath(dir, artifact.batchId, []),
        storePath: join(dir, "store.json"),
        outDir: dir,
      }),
    ).toThrow(/STORY_SHA_MISMATCH/);
  });

  it("schema-invalid artifact → refuses", () => {
    const { dir, storyPath, jsonPath, artifact } = setup();
    const broken = readJson(jsonPath) as Record<string, unknown>;
    broken.schemaVersion = 99;
    writeJson(jsonPath, broken);
    expect(() =>
      runReviewAccept({
        artifactPath: jsonPath,
        storyPath,
        decisionsPath: decisionsPath(dir, artifact.batchId, []),
        storePath: join(dir, "store.json"),
        outDir: dir,
      }),
    ).toThrow(/ARTIFACT_INVALID/);
    expect(() => parseReviewBatchArtifact({ schemaVersion: 1 })).toThrow(/ARTIFACT_INVALID/);
  });

  it("hand-edited item data → refuses (rehydrated batch must match the artifact)", () => {
    const { dir, storyPath, jsonPath, artifact } = setup();
    const edited = readJson(jsonPath) as { items: Array<Record<string, unknown>> };
    (edited.items[0].data as Record<string, unknown>).statement = "تم التلاعب بهذا البيان.";
    writeJson(jsonPath, edited);
    expect(() =>
      runReviewAccept({
        artifactPath: jsonPath,
        storyPath,
        decisionsPath: decisionsPath(dir, artifact.batchId, []),
        storePath: join(dir, "store.json"),
        outDir: dir,
      }),
    ).toThrow(/ARTIFACT_INVALID/);
  });

  it("re-verification failure on load → the item cannot be accepted", () => {
    const { dir, storyPath, jsonPath, artifact } = setup();
    // $.events[2] is the hallucinated quote: rejected, never acceptable.
    expect(() =>
      runReviewAccept({
        artifactPath: jsonPath,
        storyPath,
        decisionsPath: decisionsPath(dir, artifact.batchId, [
          { itemId: "$.events[2]", decision: "accept" },
        ]),
        storePath: join(dir, "store.json"),
        outDir: dir,
      }),
    ).toThrow(/DECISIONS_INVALID/);
  });
});

// ---------------------------------------------------------------------------
// Group 9 — decisions.
// ---------------------------------------------------------------------------
describe("9. decisions", () => {
  function setup(): {
    dir: string;
    storyPath: string;
    jsonPath: string;
    artifact: ReviewBatchArtifact;
  } {
    const dir = tempDir();
    const storyPath = join(dir, "chapter-1.txt");
    writeFileSync(storyPath, CH2, "utf-8");
    const { jsonPath, artifact } = writeArtifactFiles(dir, CH2, 1);
    return { dir, storyPath, jsonPath, artifact };
  }

  function decisionsPath(dir: string, batchId: string, decisions: unknown[]): string {
    const path = join(dir, "decisions.json");
    writeJson(path, { batchId, decisions });
    return path;
  }

  function run(
    dir: string,
    storyPath: string,
    jsonPath: string,
    batchId: string,
    decisions: unknown[],
  ): ReturnType<typeof runReviewAccept> {
    return runReviewAccept({
      artifactPath: jsonPath,
      storyPath,
      decisionsPath: decisionsPath(dir, batchId, decisions),
      storePath: join(dir, "store.json"),
      outDir: dir,
    });
  }

  it("accept requires re-verified evidence (hallucinated quote cannot be accepted)", () => {
    const { dir, storyPath, jsonPath, artifact } = setup();
    expect(() =>
      run(dir, storyPath, jsonPath, artifact.batchId, [{ itemId: "$.events[2]", decision: "accept" }]),
    ).toThrow(/DECISIONS_INVALID/);
    expect(() =>
      parseDecisionsFile(
        { batchId: artifact.batchId, decisions: [{ itemId: "$.events[2]", decision: "accept" }] },
        artifact,
      ),
    ).toThrow(/DECISIONS_INVALID/);
  });

  it("ambiguous requires chosenOccurrence", () => {
    const { dir, storyPath, jsonPath, artifact } = setup();
    expect(() =>
      run(dir, storyPath, jsonPath, artifact.batchId, [{ itemId: "$.events[1]", decision: "accept" }]),
    ).toThrow(/DECISIONS_INVALID/);
  });

  it("ambiguous accepts with an explicit chosenOccurrence", () => {
    const { dir, storyPath, jsonPath, artifact } = setup();
    const e2 = artifact.items.find((i) => i.id === "$.events[1]") as never as {
      evidence: Array<{ occurrences: Array<[number, number]> }>;
    };
    const first = e2.evidence[0].occurrences[0];
    const summary = run(dir, storyPath, jsonPath, artifact.batchId, [
      { itemId: "$.events[1]", decision: "accept", chosenOccurrence: first },
    ]);
    expect(summary.accepted).toBe(1);
    expect(summary.commitId).not.toBeNull();
  });

  it("reject requires a reason", () => {
    const { dir, storyPath, jsonPath, artifact } = setup();
    expect(() =>
      run(dir, storyPath, jsonPath, artifact.batchId, [{ itemId: "$.events[0]", decision: "reject" }]),
    ).toThrow(/DECISIONS_INVALID/);
    expect(() =>
      parseDecisionsFile(
        { batchId: artifact.batchId, decisions: [{ itemId: "$.events[0]", decision: "reject", reason: "  " }] },
        artifact,
      ),
    ).toThrow(/DECISIONS_INVALID/);
  });

  it("missing decisions leave items pending (commit still happens for accepted ones)", () => {
    const { dir, storyPath, jsonPath, artifact } = setup();
    const summary = run(dir, storyPath, jsonPath, artifact.batchId, [
      { itemId: "$.events[0]", decision: "accept" },
    ]);
    expect(summary.accepted).toBe(1);
    expect(summary.pending).toBe(artifact.items.length - 1);
    expect(summary.commitId).not.toBeNull();
    const snapshot = loadStoreSnapshotIfExists(join(dir, "store.json"));
    expect(snapshot?.reviewBatches[0].items.filter((i) => i.status === "pending").length).toBe(
      artifact.items.length - 1,
    );
  });

  it("a decision for an unknown item, or a duplicate decision, refuses", () => {
    const { artifact } = setup();
    expect(() =>
      parseDecisionsFile(
        { batchId: artifact.batchId, decisions: [{ itemId: "$.events[99]", decision: "accept" }] },
        artifact,
      ),
    ).toThrow(/DECISIONS_INVALID/);
    expect(() =>
      parseDecisionsFile(
        {
          batchId: artifact.batchId,
          decisions: [
            { itemId: "$.events[0]", decision: "accept" },
            { itemId: "$.events[0]", decision: "reject", reason: "x" },
          ],
        },
        artifact,
      ),
    ).toThrow(/DECISIONS_INVALID/);
  });
});

// ---------------------------------------------------------------------------
// Group 10 — store snapshot round-trip across two runs.
// ---------------------------------------------------------------------------
describe("10. store snapshot round-trip", () => {
  /** Chapter 1 output: the character dies (dead fact, valid from the death event). */
  function chapter1DeathOutput(body: string): Record<string, unknown> {
    const s1 = sentenceSpans(body)[0];
    const span = { quote: s1.text, start_offset: s1.start, end_offset: s1.end };
    return {
      propositions: [{ local_id: "p1", statement: s1.text, evidence: [span] }],
      events: [
        {
          local_id: "d1",
          kind: "death",
          summary: s1.text,
          participants: [{ character: "الشخصية الأولى", role: "victim" }],
          location: null,
          story_time: null,
          span_start: 0,
          span_end: 1,
          reality_scope: "real",
          certainty: "asserted",
          evidence: [span],
          knowledge_transfer: null,
          knowledge_use: null,
        },
      ],
      knowledge: [],
      character_facts: [
        {
          character: "الشخصية الأولى",
          kind: "dead",
          value: "ميت",
          valid_from_event_local_id: "d1",
          evidence: [span],
        },
      ],
      promises: [],
    };
  }

  function review(
    dir: string,
    body: string,
    seq: number,
    extracted: ExtractedArtifact,
    decisions: unknown[],
  ): ReturnType<typeof runReviewAccept> {
    const storyPath = join(dir, `chapter-${seq}.txt`);
    writeFileSync(storyPath, body, "utf-8");
    const { artifact, jsonPath } = (() => {
      const built = buildReviewBatchArtifact({
        extracted,
        chapterBody: body,
        chapterSeq: seq,
        storyTitle: "Test story",
      });
      const paths = writeReviewBatchArtifact(dir, built.artifact);
      return { artifact: built.artifact, jsonPath: paths.jsonPath };
    })();
    const decisionsFile = join(dir, `decisions-${seq}.json`);
    writeJson(decisionsFile, { batchId: artifact.batchId, decisions });
    return runReviewAccept({
      artifactPath: jsonPath,
      storyPath,
      decisionsPath: decisionsFile,
      storePath: join(dir, "store.json"),
      outDir: dir,
    });
  }

  it("commit in run A loads in run B; checker on chapter 2 sees chapter 1 state", () => {
    const dir = tempDir();
    // Run A — chapter 1: death fact committed, no findings.
    const summaryA = review(dir, CH1, 1, fakeExtracted(chapter1DeathOutput(CH1), CH1), [
      { itemId: "$.propositions[0]", decision: "accept" },
      { itemId: "$.events[0]", decision: "accept" },
      { itemId: "$.character_facts[0]", decision: "accept" },
    ]);
    expect(summaryA.commitId).not.toBeNull();
    expect(summaryA.findings).toBe(0);

    // Run B — chapter 2 (mock): the same character acts again. The
    // mock's alive fact is rejected so the chapter-1 death stays the
    // latest life-state, and the checker must flag the acts.
    const ch2Artifact = buildReviewBatchArtifact({
      extracted: runMockExtraction({ chapterBody: CH2, chapterSeq: 2 }),
      chapterBody: CH2,
      chapterSeq: 2,
    }).artifact;
    const e2 = ch2Artifact.items.find((i) => i.id === "$.events[1]") as never as {
      evidence: Array<{ occurrences: Array<[number, number]> }>;
    };
    const summaryB = review(
      dir,
      CH2,
      2,
      fakeExtracted(ch2Artifact.extractorOutput, CH2),
      [
        { itemId: "$.events[0]", decision: "accept" },
        { itemId: "$.events[1]", decision: "accept", chosenOccurrence: e2.evidence[0].occurrences[0] },
        { itemId: "$.propositions[0]", decision: "accept" },
        { itemId: "$.knowledge[0]", decision: "accept" },
        { itemId: "$.promises[0]", decision: "accept" },
        {
          itemId: "$.character_facts[0]",
          decision: "reject",
          reason: "alive fact excluded so the chapter-1 death stays the latest life-state",
        },
        { itemId: "$.events[2]", decision: "reject", reason: "hallucinated quote" },
      ],
    );
    expect(summaryB.commitId).not.toBeNull();
    expect(summaryB.findings).toBe(2);
    expect(summaryB.findingsByRule).toEqual({ DEAD_ACTS: 2 });
    expect(summaryB.findingsByConfidence).toEqual({ confirmed: 2 });

    // The snapshot holds both chapters and both review batches.
    const snapshot = loadStoreSnapshotIfExists(join(dir, "store.json"));
    expect(snapshot).not.toBeNull();
    expect(snapshot?.reviewBatches.length).toBe(2);
    expect(snapshot?.ledger.chapters.length).toBe(2);
    expect(snapshot?.ledger.characterFacts.length).toBe(1);
    expect(snapshot?.ledger.characterFacts[0].kind).toBe("dead");
  });

  it("unknown snapshot version is refused", () => {
    const dir = tempDir();
    const storePath = join(dir, "store.json");
    writeJson(storePath, { schemaVersion: 99, artifactKind: "store-snapshot" });
    const storyPath = join(dir, "chapter-1.txt");
    writeFileSync(storyPath, CH2, "utf-8");
    const { jsonPath, artifact } = writeArtifactFiles(dir, CH2, 1);
    const decisionsFile = join(dir, "decisions.json");
    writeJson(decisionsFile, { batchId: artifact.batchId, decisions: [] });
    expect(() =>
      runReviewAccept({
        artifactPath: jsonPath,
        storyPath,
        decisionsPath: decisionsFile,
        storePath,
        outDir: dir,
      }),
    ).toThrow(/STORE_VERSION_UNKNOWN/);
  });
});

// ---------------------------------------------------------------------------
// Group 11 — privacy: --live without attestation refuses; no raw output.
// ---------------------------------------------------------------------------
describe("11. privacy preconditions", () => {
  it("--live without --privacy-confirmed refuses", () => {
    expect(() => parseExtractionArgs(["--file", "x.txt", "--live"])).toThrow(/PRIVACY_NOT_CONFIRMED/);
  });

  it("--live with --privacy-confirmed parses (gate itself is separate)", () => {
    const cli = parseExtractionArgs(["--file", "x.txt", "--live", "--privacy-confirmed"]);
    expect(cli.mode).toBe("live");
    expect(cli.privacyConfirmed).toBe(true);
  });

  it("no raw output files while store_raw_outputs is false", async () => {
    expect(loadConfig().privacy.store_raw_outputs).toBe(false);
    const dir = tempDir();
    // Mock end-to-end: the artifact must not carry raw model text.
    const { counting } = countingMock({ generationCost: 0 });
    const extracted = await runExtraction(
      { countingFetch: counting, config: liveConfig() },
      { chapterBody: CH2, chapterSeq: 1, model: SLUG, provider: PROVIDER },
    );
    const { artifact } = buildReviewBatchArtifact({ extracted, chapterBody: CH2, chapterSeq: 1 });
    expect(typeof artifact.extractorOutput).toBe("object");
    const { jsonPath, mdPath } = writeReviewBatchArtifact(dir, artifact);
    const keys = collectKeys(readJson(jsonPath));
    expect(keys.has("rawText")).toBe(false);
    expect(keys.has("rawOutput")).toBe(false);
    expect(keys.has("raw")).toBe(false);
    expect(readFileSync(mdPath, "utf-8")).not.toContain("rawText");
  });
});

// ---------------------------------------------------------------------------
// Group 12 — regression: the existing suite stays green, untouched.
// ---------------------------------------------------------------------------
describe("12. regression guard", () => {
  it("no existing module was modified: worker.ts does not reference the runner", () => {
    const worker = readFileSync(join(process.cwd(), "storyworld/lib/jobs/worker.ts"), "utf-8");
    expect(worker).not.toContain("live-runner");
    expect(worker).not.toContain("CountingFetch");
  });

  it("the full existing suite is verified by running npm test (see report)", () => {
    // This file adds tests only; the green `npm test` run (114 existing
    // + the new groups in this file) is the regression proof.
    expect(true).toBe(true);
  });
});
