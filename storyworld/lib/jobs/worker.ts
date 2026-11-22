/**
 * Story-World worker (M0) — spec sections 4 and 9.
 *
 * Dequeues with a lease, runs within the job's budget envelope, and writes
 * `result` or `error` exactly once. M0 implements only the `extract` kind,
 * against recorded fixtures — no live calls, no database, no deploy.
 * Other kinds (`review`, `write`, `repair`) are M1/M2 work and fail with
 * a clear not-implemented error.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loadConfig, repoRoot } from "../config";
import {
  JobBudgetEnvelope,
  OpenRouterClient,
  type ChatCompletionResult,
} from "../openrouter";
import { TelemetryLog, type CallLogEntry } from "../telemetry";
import { EXTRACTOR_PROMPT_VERSION, EXTRACTOR_SYSTEM_PROMPT, buildExtractorUserMessage } from "../extractor/prompts";
import { GENIE_EXTRACTOR_OUTPUT_SCHEMA } from "../extractor/schema";
import { validateExtractorOutput } from "../extractor/validate";
import { verifyExtraction, type RejectedItem, type VerifiedItem } from "../extractor/evidence";
import { JobQueue, type Job } from "./queue";

export interface ExtractJobPayload {
  fixtureId: string;
  chapterSeq: number;
  cast?: string[];
}

export interface FixtureChapter {
  seq: number;
  body: string;
  story_order_base: number;
  expected_extraction: unknown;
}

export interface Fixture {
  fixture_id: string;
  chapters: FixtureChapter[];
  [key: string]: unknown;
}

export interface ExtractJobResult {
  fixtureId: string;
  chapterSeq: number;
  promptVersion: string;
  /** Validated extractor output (the candidate records). */
  candidates: unknown;
  verified: VerifiedItem[];
  rejected: RejectedItem[];
  evidenceOk: boolean;
  telemetry: CallLogEntry;
  modelRequested: string | null;
  modelResolved: string | null;
  tokens: number;
  costUsd: number | null;
  /** M0 runs fully offline: the client performs zero network calls. */
  networkCalls: 0;
}

export interface WorkerDeps {
  client?: OpenRouterClient;
  telemetry?: TelemetryLog;
  fixturesDir?: string;
}

/** Load a dev fixture by its `fixture_id` from `storyworld/fixtures/<dir>/fixture.json`. */
export function loadFixture(fixtureId: string, fixturesDir?: string): Fixture {
  const base = fixturesDir ?? join(repoRoot(), "storyworld", "fixtures");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fixtureId)) {
    throw new Error(`Invalid fixture id: ${fixtureId}`);
  }
  // Direct hit first: a directory named exactly like the fixture id.
  try {
    const raw = readFileSync(join(base, fixtureId, "fixture.json"), "utf-8");
    return JSON.parse(raw) as Fixture;
  } catch {
    // Fall through to scanning by fixture_id below.
  }
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = readFileSync(join(base, entry.name, "fixture.json"), "utf-8");
      const parsed = JSON.parse(raw) as Fixture;
      if (parsed.fixture_id === fixtureId) return parsed;
    } catch {
      continue;
    }
  }
  throw new Error(`Fixture not found: ${fixtureId}`);
}

export async function runExtractJob(
  job: Job,
  deps: WorkerDeps = {},
): Promise<ExtractJobResult> {
  const payload = job.payload as unknown as ExtractJobPayload;
  if (typeof payload.fixtureId !== "string" || typeof payload.chapterSeq !== "number") {
    throw new Error("VALIDATION_FAILED: extract job payload needs fixtureId and chapterSeq.");
  }
  const config = loadConfig();
  // Live calls must stay off in M0: the demo asserts this before any work.
  if (config.live_calls.enabled) {
    throw new Error("LIVE_CALLS_DISABLED: M0 runs offline only; live_calls.enabled must be false.");
  }
  const telemetry = deps.telemetry ?? new TelemetryLog();
  const client = deps.client ?? new OpenRouterClient({ config, telemetry });
  const fixture = loadFixture(payload.fixtureId, deps.fixturesDir);
  const chapter = fixture.chapters.find((c) => c.seq === payload.chapterSeq);
  if (!chapter) {
    throw new Error(`VALIDATION_FAILED: chapter ${payload.chapterSeq} not found in fixture ${payload.fixtureId}.`);
  }

  const budget = new JobBudgetEnvelope({
    maxCalls: job.budget.maxCalls,
    maxTokens: job.budget.maxTokens,
    maxSeconds: job.budget.maxSeconds,
  });

  const result: ChatCompletionResult = await client.chatCompletion({
    model: config.models.extractor,
    messages: [
      { role: "system", content: EXTRACTOR_SYSTEM_PROMPT },
      {
        role: "user",
        content: buildExtractorUserMessage({
          chapterBody: chapter.body,
          chapterSeq: chapter.seq,
          storyOrderBase: chapter.story_order_base,
          cast: payload.cast ?? [],
        }),
      },
    ],
    responseFormat: { name: "GenieExtractorOutput", schema: GENIE_EXTRACTOR_OUTPUT_SCHEMA as unknown as Record<string, unknown> },
    purpose: "extract",
    jobId: job.id,
    recordingKey: `extract-chapter-${chapter.seq}`,
    budget,
  });
  if (result.source !== "fixture") {
    throw new Error("LIVE_CALLS_DISABLED: M0 extract jobs must run from recorded fixtures.");
  }

  const validation = validateExtractorOutput(result.output);
  if (!validation.valid) {
    throw new Error(
      `VALIDATION_FAILED: extractor output failed schema validation: ${validation.errors
        .map((e) => `${e.path} ${e.message}`)
        .join("; ")}`,
    );
  }

  const verification = verifyExtraction(chapter.body, result.output);
  if (!verification.ok) {
    throw new Error(
      `EVIDENCE_VERIFICATION_FAILED: ${verification.rejected
        .map((r) => `${r.itemPath} ${r.reason}`)
        .join("; ")}`,
    );
  }

  return {
    fixtureId: payload.fixtureId,
    chapterSeq: chapter.seq,
    promptVersion: EXTRACTOR_PROMPT_VERSION,
    candidates: result.output,
    verified: verification.verified,
    rejected: verification.rejected,
    evidenceOk: verification.ok,
    telemetry: result.telemetry,
    modelRequested: result.modelRequested,
    modelResolved: result.modelResolved,
    tokens: (result.promptTokens ?? 0) + (result.completionTokens ?? 0),
    costUsd: result.costUsd,
    networkCalls: 0,
  };
}

/** Dispatch one job by kind. M0 implements `extract` only. */
export async function runJob(job: Job, deps: WorkerDeps = {}): Promise<unknown> {
  switch (job.kind) {
    case "extract":
      return runExtractJob(job, deps);
    default:
      throw new Error(`NOT_IMPLEMENTED: job kind "${job.kind}" is not built in M0.`);
  }
}

/**
 * Dequeue one job (with lease) and run it to completion, writing `result`
 * or `error` exactly once. Returns the finished job, or null when the
 * queue is empty.
 */
export async function runNext(queue: JobQueue, workerId: string, deps: WorkerDeps = {}): Promise<Job | null> {
  const job = queue.dequeue(workerId);
  if (!job) return null;
  try {
    const result = await runJob(job, deps);
    return queue.complete(job.id, result) ?? job;
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return queue.fail(job.id, message) ?? job;
  }
}
