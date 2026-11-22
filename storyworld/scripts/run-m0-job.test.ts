/**
 * M0 offline demo job (spec section 11) — PLUMBING TEST, not an accuracy
 * test.
 *
 * Run with: `npm run storyworld:m0`
 *
 * Creates an `extract` job for chapter 1 of the dev fixture, runs it
 * through the worker in recorded-fixture mode, verifies evidence in code,
 * and prints the resulting candidates + telemetry. Zero network calls:
 * the client is constructed with a fetch that throws if ever invoked, and
 * the test fails if any live call is attempted.
 *
 * It replays a recording that is equal to the gold answer, so it passes
 * by construction. It proves plumbing (schema validation, offset
 * verification, job flow) and says NOTHING about model extraction
 * quality. Never describe it as extraction accuracy.
 */
import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../lib/config";
import { OpenRouterClient } from "../lib/openrouter";
import { TelemetryLog } from "../lib/telemetry";
import { JobQueue } from "../lib/jobs/queue";
import { runNext, type ExtractJobResult } from "../lib/jobs/worker";

describe("M0 offline demo job (plumbing test — replays a recording; passes by construction)", () => {
  it("extracts chapter 1 of dev-short-story-v1 end to end, offline (plumbing only)", async () => {
    // The test FAILS if live calls are enabled anywhere in this path.
    const config = loadConfig();
    expect(config.live_calls.enabled).toBe(false);
    expect(config.models.extractor).toBeNull();

    // Any fetch attempt is a failure: the spy throws, the job fails.
    const fetchSpy = vi.fn(() => {
      throw new Error("NETWORK CALL ATTEMPTED — M0 must run fully offline");
    });
    const telemetry = new TelemetryLog();
    const client = new OpenRouterClient({
      config,
      telemetry,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    const queue = new JobQueue();
    const job = queue.enqueue(
      "extract",
      "m0-demo-extract-chapter-1",
      {
        fixtureId: "dev-short-story-v1",
        chapterSeq: 1,
        cast: ["سالم", "عمر", "ليلى", "كريم"],
      },
      {
        maxCalls: config.job_budget.maxCallsPerJob,
        maxTokens: config.job_budget.maxTotalTokensPerJob,
        maxSeconds: config.job_budget.maxSecondsPerJob,
      },
    );

    const finished = await runNext(queue, "m0-demo-worker", { client, telemetry });
    console.log("job finished:", finished?.status, finished?.error ?? "");
    expect(finished).not.toBeNull();
    expect(finished?.id).toBe(job.id);
    expect(finished?.status).toBe("succeeded");
    expect(fetchSpy).not.toHaveBeenCalled();

    const result = finished?.result as ExtractJobResult;
    expect(result.networkCalls).toBe(0);
    expect(result.evidenceOk).toBe(true);
    expect(result.rejected).toEqual([]);
    expect(result.verified.length).toBeGreaterThan(0);

    const candidates = result.candidates as {
      events: Array<{ local_id: string; kind: string; summary: string }>;
      character_facts: Array<{ character: string; kind: string }>;
    };
    expect(candidates.events.map((e) => e.local_id)).toEqual(["e1", "e2"]);
    expect(candidates.character_facts).toHaveLength(1);

    // --- Demo output (visible in vitest output) ---
    console.log("\n=== M0 offline demo job ===");
    console.log(`job: ${finished?.id} (${finished?.kind}) -> ${finished?.status}`);
    console.log(`fixture: ${result.fixtureId}, chapter ${result.chapterSeq}, prompt ${result.promptVersion}`);
    console.log(`candidates (extracted, evidence-verified in code):`);
    console.log(JSON.stringify(result.candidates, null, 2));
    console.log(`verified evidence items: ${result.verified.length}, rejected: ${result.rejected.length}`);
    console.log("telemetry:");
    console.log(
      JSON.stringify(
        {
          model_requested: result.modelRequested,
          model_resolved: result.modelResolved,
          tokens: result.tokens,
          cost_usd: result.costUsd,
          latency_ms: result.telemetry.latency_ms,
          prompt_sha256: result.telemetry.prompt_sha256,
          status: result.telemetry.status,
        },
        null,
        2,
      ),
    );
    console.log("network calls: 0");
    console.log("0 network calls — live_calls.enabled=false, served from recorded fixture.");
    console.log("=== end M0 demo job ===\n");
  });
});
