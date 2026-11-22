/**
 * Story-World telemetry (M0).
 *
 * Call-log entries record models, tokens, cost, latency and hashes ONLY.
 * Prompt and manuscript text are NEVER stored here — see spec section 8.
 * This module is pure in-memory for M0 (the `llm_call_log` table in the
 * migration is the M1 persistence target); it keeps the OpenRouter client
 * clean of logging concerns.
 */
import { createHash } from "node:crypto";

export type LlmPurpose = "extract" | "write" | "review" | "repair";

export interface CallLogEntry {
  job_id: string | null;
  purpose: LlmPurpose;
  /** Model slug that was requested (null when running from a recording). */
  model_requested: string | null;
  /** Model slug the provider actually served (null in fixture mode). */
  model_resolved: string | null;
  generation_id: string | null;
  /** SHA-256 of the request payload. A hash only — never prompt text. */
  prompt_sha256: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: number | null;
  latency_ms: number;
  status: string;
  created_at: string;
}

export interface NewCallLogEntry {
  job_id?: string | null;
  purpose: LlmPurpose;
  model_requested: string | null;
  model_resolved?: string | null;
  generation_id?: string | null;
  prompt_sha256: string;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  cost_usd?: number | null;
  latency_ms: number;
  status: string;
}

/** SHA-256 hex of any JSON-serialisable value (used for prompt hashing). */
export function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** SHA-256 hex of a string (used for body binding, e.g. body_sha256). */
export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

/** In-memory call log for M0. Entries are append-only within a process. */
export class TelemetryLog {
  private entries: CallLogEntry[] = [];

  record(entry: NewCallLogEntry): CallLogEntry {
    const full: CallLogEntry = {
      job_id: entry.job_id ?? null,
      purpose: entry.purpose,
      model_requested: entry.model_requested,
      model_resolved: entry.model_resolved ?? null,
      generation_id: entry.generation_id ?? null,
      prompt_sha256: entry.prompt_sha256,
      prompt_tokens: entry.prompt_tokens ?? null,
      completion_tokens: entry.completion_tokens ?? null,
      cost_usd: entry.cost_usd ?? null,
      latency_ms: entry.latency_ms,
      status: entry.status,
      created_at: new Date().toISOString(),
    };
    this.entries.push(full);
    return full;
  }

  all(): ReadonlyArray<CallLogEntry> {
    return this.entries;
  }

  forJob(jobId: string): CallLogEntry[] {
    return this.entries.filter((e) => e.job_id === jobId);
  }
}
