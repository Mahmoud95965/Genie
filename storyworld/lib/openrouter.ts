/**
 * Story-World OpenRouter client (M0) — server-only.
 *
 * Spec section 5. Rules enforced here, in code:
 * - Request allowlist: only `model`, `messages`, `response_format`,
 *   `max_tokens`, `temperature`, `seed`, `provider`. No `tools`, no
 *   `plugins`, no `web`, no `models`/`route` fallback.
 * - Structured output via `response_format` (json_schema, strict).
 * - Telemetry records models, tokens, cost, latency and hashes ONLY —
 *   never prompt or manuscript text (see `lib/telemetry.ts`).
 * - Every LLM attempt, including retries, decrements the job's budget
 *   envelope. Exhaustion fails with `JOB_BUDGET_EXHAUSTED`.
 * - Live-call gating: with `live_calls.enabled === false` the client
 *   serves ONLY recorded fixtures under `fixtures/llm-recordings/` and
 *   fails anything else with `LIVE_CALLS_DISABLED` — the gate is checked
 *   BEFORE any network call, so a disabled client never touches the
 *   network. No live call is made in M0.
 *
 * This module must never be imported by client-side code.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { loadConfig, repoRoot, type StoryworldConfig } from "./config";
import { sha256Json, TelemetryLog, type CallLogEntry, type LlmPurpose } from "./telemetry";

export const LIVE_CALLS_DISABLED = "LIVE_CALLS_DISABLED";
export const JOB_BUDGET_EXHAUSTED = "JOB_BUDGET_EXHAUSTED";
export const PROVIDER_ERROR = "PROVIDER_ERROR";
export const UNPRICED_MODEL = "UNPRICED_MODEL";

export class LiveCallsDisabledError extends Error {
  readonly code = LIVE_CALLS_DISABLED;
  constructor(message = "Live calls are disabled. No recorded fixture matches this request.") {
    super(message);
    this.name = "LiveCallsDisabledError";
  }
}

export class JobBudgetExhaustedError extends Error {
  readonly code = JOB_BUDGET_EXHAUSTED;
  constructor(message = "Job budget envelope exhausted.") {
    super(message);
    this.name = "JobBudgetExhaustedError";
  }
}

export class ProviderError extends Error {
  readonly code = PROVIDER_ERROR;
  /** HTTP status when the failure was an HTTP response; undefined for transport errors. */
  readonly status?: number;
  /** Parsed Retry-After header (ms), null when absent or invalid. */
  readonly retryAfterMs: number | null;
  constructor(message: string, opts: { status?: number; retryAfterMs?: number | null } = {}) {
    super(message);
    this.name = "ProviderError";
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs ?? null;
  }
}

/** Parse a Retry-After header (delta-seconds or HTTP-date) to ms; null when absent/invalid. */
function parseRetryAfterMs(header: string | null): number | null {
  if (header === null) return null;
  const trimmed = header.trim();
  if (trimmed === "") return null;
  const secs = Number(trimmed);
  if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

export class UnpricedModelError extends Error {
  readonly code = UNPRICED_MODEL;
  constructor(message = "Live call denied: no approved, priced model is configured.") {
    super(message);
    this.name = "UnpricedModelError";
  }
}

/** Job budget envelope (spec section 4). Decremented on EVERY attempt. */
export interface JobBudget {
  maxCalls: number;
  maxTokens: number;
  maxSeconds: number;
}

export class JobBudgetEnvelope {
  readonly maxCalls: number;
  readonly maxTokens: number;
  readonly maxSeconds: number;
  callsUsed = 0;
  tokensUsed = 0;
  private readonly startedAt = Date.now();

  constructor(budget: JobBudget) {
    this.maxCalls = budget.maxCalls;
    this.maxTokens = budget.maxTokens;
    this.maxSeconds = budget.maxSeconds;
  }

  static fromConfig(config: StoryworldConfig): JobBudgetEnvelope {
    return new JobBudgetEnvelope({
      maxCalls: config.job_budget.maxCallsPerJob,
      maxTokens: config.job_budget.maxTotalTokensPerJob,
      maxSeconds: config.job_budget.maxSecondsPerJob,
    });
  }

  get remainingCalls(): number {
    return this.maxCalls - this.callsUsed;
  }

  get remainingTokens(): number {
    return this.maxTokens - this.tokensUsed;
  }

  get elapsedSeconds(): number {
    return (Date.now() - this.startedAt) / 1000;
  }

  /** Charge tokens (when known after a call) without charging another call. */
  chargeTokens(tokens: number): void {
    if (this.tokensUsed + tokens > this.maxTokens) {
      throw new JobBudgetExhaustedError(
        `Job budget exhausted: token envelope would exceed ${this.maxTokens}.`,
      );
    }
    this.tokensUsed += tokens;
  }

  /** Charge one attempt (and its tokens, when known) against the envelope. */
  consumeAttempt(tokens = 0): void {
    if (this.callsUsed >= this.maxCalls) {
      throw new JobBudgetExhaustedError(
        `Job budget exhausted: ${this.callsUsed}/${this.maxCalls} calls used.`,
      );
    }
    if (this.tokensUsed + tokens > this.maxTokens) {
      throw new JobBudgetExhaustedError(
        `Job budget exhausted: token envelope would exceed ${this.maxTokens}.`,
      );
    }
    if (this.elapsedSeconds > this.maxSeconds) {
      throw new JobBudgetExhaustedError(
        `Job budget exhausted: ${this.elapsedSeconds.toFixed(1)}s over ${this.maxSeconds}s.`,
      );
    }
    this.callsUsed += 1;
    this.tokensUsed += tokens;
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface JsonSchemaFormat {
  name: string;
  schema: Record<string, unknown>;
}

export interface ChatCompletionRequest {
  /** Model slug, or null for recorded-fixture mode. */
  model: string | null;
  messages: ChatMessage[];
  responseFormat?: JsonSchemaFormat | null;
  maxTokens?: number;
  temperature?: number;
  seed?: number;
  /** Provider routing lock, used only for measured/spend-bounded runs. */
  provider?: Record<string, unknown>;
  purpose: LlmPurpose;
  jobId?: string | null;
  /** Fixture key, e.g. "extract-chapter-1" -> fixtures/llm-recordings/<key>.json */
  recordingKey?: string;
  budget: JobBudgetEnvelope;
}

export interface ChatCompletionResult {
  /** Parsed model output (the JSON object from the response / recording). */
  output: unknown;
  modelRequested: string | null;
  modelResolved: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  latencyMs: number;
  source: "fixture" | "live";
  telemetry: CallLogEntry;
}

export interface OpenRouterClientOptions {
  config?: StoryworldConfig;
  telemetry?: TelemetryLog;
  /** Injectable fetch (tests pass a spy to prove no network call happens). */
  fetchImpl?: typeof fetch;
  /** Override for the fixtures directory (tests may point elsewhere). */
  fixturesDir?: string;
}

interface RecordingFile {
  recording_id?: string;
  purpose?: string;
  model_requested?: string | null;
  response: unknown;
}

export class OpenRouterClient {
  private readonly config: StoryworldConfig;
  private readonly telemetry: TelemetryLog;
  private readonly fetchImpl: typeof fetch;
  private readonly fixturesDir: string;

  constructor(options: OpenRouterClientOptions = {}) {
    this.config = options.config ?? loadConfig();
    this.telemetry = options.telemetry ?? new TelemetryLog();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.fixturesDir = options.fixturesDir ?? join(repoRoot(), "storyworld", "fixtures", "llm-recordings");
  }

  getTelemetry(): TelemetryLog {
    return this.telemetry;
  }

  /** Load a recorded fixture response by key. Returns null when absent. */
  private loadRecording(recordingKey: string): RecordingFile | null {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(recordingKey)) return null;
    try {
      const raw = readFileSync(join(this.fixturesDir, `${recordingKey}.json`), "utf-8");
      const parsed = JSON.parse(raw) as RecordingFile;
      if (!parsed || typeof parsed !== "object" || !("response" in parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const startedAt = Date.now();
    // Hash the request for telemetry. A hash only — never prompt text.
    const promptSha = sha256Json({
      model: request.model,
      messages: request.messages,
      responseFormat: request.responseFormat ?? null,
    });

    // --- Live-call gate: checked BEFORE any network call. ---
    if (!this.config.live_calls.enabled) {
      if (request.recordingKey) {
        const recording = this.loadRecording(request.recordingKey);
        if (recording) {
          request.budget.consumeAttempt(0);
          const latencyMs = Date.now() - startedAt;
          const telemetry = this.telemetry.record({
            job_id: request.jobId ?? null,
            purpose: request.purpose,
            model_requested: null,
            model_resolved: null,
            generation_id: null,
            prompt_sha256: promptSha,
            prompt_tokens: 0,
            completion_tokens: 0,
            cost_usd: null,
            latency_ms: latencyMs,
            status: "ok-fixture",
          });
          return {
            output: recording.response,
            modelRequested: null,
            modelResolved: null,
            promptTokens: 0,
            completionTokens: 0,
            costUsd: null,
            latencyMs,
            source: "fixture",
            telemetry,
          };
        }
      }
      // No recording (or no key): refuse without touching the network.
      this.telemetry.record({
        job_id: request.jobId ?? null,
        purpose: request.purpose,
        model_requested: request.model,
        model_resolved: null,
        generation_id: null,
        prompt_sha256: promptSha,
        prompt_tokens: null,
        completion_tokens: null,
        cost_usd: null,
        latency_ms: Date.now() - startedAt,
        status: LIVE_CALLS_DISABLED,
      });
      throw new LiveCallsDisabledError(
        "Live calls are disabled (live_calls.enabled=false) and no recorded fixture " +
          `exists for key "${request.recordingKey ?? "(none)"}".`,
      );
    }

    // --- Live path (not used in M0; live_calls.enabled is false). ---
    if (this.config.require_explicit_model && !request.model) {
      throw new UnpricedModelError("No model configured for this role (model is null).");
    }
    if (
      this.config.live_calls.hard_cap_usd_per_month === null ||
      this.config.live_calls.approved_models.length === 0
    ) {
      throw new UnpricedModelError(
        "Live calls require hard_cap_usd_per_month and at least one priced approved model.",
      );
    }
    const approved = this.config.live_calls.approved_models as Array<Record<string, unknown>>;
    if (request.model && !approved.some((m) => m.slug === request.model)) {
      throw new UnpricedModelError(`Model "${request.model}" is not in live_calls.approved_models.`);
    }

    // Allowlisted request body ONLY — no tools, plugins, web, or routing.
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
    };
    if (request.responseFormat) {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: request.responseFormat.name,
          strict: true,
          schema: request.responseFormat.schema,
        },
      };
    }
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.seed !== undefined) body.seed = request.seed;
    if (request.provider !== undefined) body.provider = request.provider;

    const maxAttempts = 1 + this.config.openrouter.maxRetriesPerCall;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      // Every attempt, including retries, decrements the same envelope.
      request.budget.consumeAttempt(0);
      const attemptStarted = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.openrouter.timeoutMs);
        let response: Response;
        try {
          response = await this.fetchImpl(`${this.config.openrouter.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
        if (!response.ok) {
          throw new ProviderError(`OpenRouter ${response.status} on chat/completions.`, {
            status: response.status,
            retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
          });
        }
        const data = (await response.json()) as {
          model?: string;
          id?: string;
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const content = data.choices?.[0]?.message?.content ?? "";
        let output: unknown = content;
        try {
          output = JSON.parse(content);
        } catch {
          // Non-JSON content is a validation failure for the caller, not a retry.
        }
        const promptTokens = data.usage?.prompt_tokens ?? null;
        const completionTokens = data.usage?.completion_tokens ?? null;
        request.budget.chargeTokens((promptTokens ?? 0) + (completionTokens ?? 0));
        const costUsd = await this.fetchGenerationCost(data.id).catch(() => null);
        const latencyMs = Date.now() - attemptStarted;
        const telemetry = this.telemetry.record({
          job_id: request.jobId ?? null,
          purpose: request.purpose,
          model_requested: request.model,
          model_resolved: data.model ?? null,
          generation_id: data.id ?? null,
          prompt_sha256: promptSha,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          cost_usd: costUsd,
          latency_ms: latencyMs,
          status: "ok",
        });
        return {
          output,
          modelRequested: request.model,
          modelResolved: data.model ?? null,
          promptTokens,
          completionTokens,
          costUsd,
          latencyMs,
          source: "live",
          telemetry,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (error instanceof JobBudgetExhaustedError) throw error;
        // Retry only provider/transport errors, within the retry budget.
      }
    }
    const latencyMs = Date.now() - startedAt;
    this.telemetry.record({
      job_id: request.jobId ?? null,
      purpose: request.purpose,
      model_requested: request.model,
      model_resolved: null,
      generation_id: null,
      prompt_sha256: promptSha,
      prompt_tokens: null,
      completion_tokens: null,
      cost_usd: null,
      latency_ms: latencyMs,
      status: PROVIDER_ERROR,
    });
    throw lastError instanceof ProviderError
      ? lastError
      : new ProviderError(lastError?.message ?? "OpenRouter call failed after retries.");
  }

  /** Best-effort cost lookup; missing cost is stored as null, never guessed. */
  private async fetchGenerationCost(generationId: string | undefined): Promise<number | null> {
    if (!generationId) return null;
    try {
      const response = await this.fetchImpl(
        `${this.config.openrouter.baseUrl}/generation?id=${encodeURIComponent(generationId)}`,
        { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}` } },
      );
      if (!response.ok) return null;
      const data = (await response.json()) as { data?: { total_cost?: number } };
      return typeof data.data?.total_cost === "number" ? data.data.total_cost : null;
    } catch {
      return null;
    }
  }
}
