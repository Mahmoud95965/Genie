/**
 * M0 live-call gating tests (spec sections 4 and 5).
 *
 * With `live_calls.enabled === false` the client serves ONLY recorded
 * fixtures and fails anything else with `LIVE_CALLS_DISABLED` — the gate
 * is checked before any fetch, so no network call is ever performed.
 * The test proves this with an injected fetch spy that would throw if
 * called. Fully offline.
 */
import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../lib/config";
import {
  JobBudgetEnvelope,
  LiveCallsDisabledError,
  OpenRouterClient,
} from "../lib/openrouter";
import { EXTRACTOR_SYSTEM_PROMPT } from "../lib/extractor/prompts";
import { GENIE_EXTRACTOR_OUTPUT_SCHEMA } from "../lib/extractor/schema";

function budget(): JobBudgetEnvelope {
  return new JobBudgetEnvelope({ maxCalls: 20, maxTokens: 100000, maxSeconds: 600 });
}

describe("OpenRouter client with live calls disabled", () => {
  it("loads config with live_calls.enabled === false", () => {
    const config = loadConfig();
    expect(config.live_calls.enabled).toBe(false);
    expect(config.models.extractor).toBeNull();
    expect(config.deploy_mode).toBe("local");
  });

  it("throws LIVE_CALLS_DISABLED for a missing recording without fetching", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("fetch must never be called while live calls are disabled");
    });
    const client = new OpenRouterClient({ fetchImpl: fetchSpy as unknown as typeof fetch });
    let caught: unknown;
    try {
      await client.chatCompletion({
        model: null,
        messages: [{ role: "system", content: EXTRACTOR_SYSTEM_PROMPT }],
        purpose: "extract",
        recordingKey: "does-not-exist",
        budget: budget(),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LiveCallsDisabledError);
    expect((caught as LiveCallsDisabledError).code).toBe("LIVE_CALLS_DISABLED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws LIVE_CALLS_DISABLED with no recording key, without fetching", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("fetch must never be called while live calls are disabled");
    });
    const client = new OpenRouterClient({ fetchImpl: fetchSpy as unknown as typeof fetch });
    await expect(
      client.chatCompletion({
        model: "some/model",
        messages: [{ role: "user", content: "hello" }],
        purpose: "extract",
        budget: budget(),
      }),
    ).rejects.toMatchObject({ code: "LIVE_CALLS_DISABLED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("serves an existing recording in fixture mode, still without fetching", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("fetch must never be called in fixture mode");
    });
    const client = new OpenRouterClient({ fetchImpl: fetchSpy as unknown as typeof fetch });
    const result = await client.chatCompletion({
      model: null,
      messages: [{ role: "system", content: EXTRACTOR_SYSTEM_PROMPT }],
      responseFormat: { name: "GenieExtractorOutput", schema: GENIE_EXTRACTOR_OUTPUT_SCHEMA as unknown as Record<string, unknown> },
      purpose: "extract",
      jobId: "test-job",
      recordingKey: "extract-chapter-1",
      budget: budget(),
    });
    expect(result.source).toBe("fixture");
    expect(result.modelRequested).toBeNull();
    expect(result.modelResolved).toBeNull();
    expect(result.costUsd).toBeNull();
    expect(result.promptTokens).toBe(0);
    expect(result.completionTokens).toBe(0);
    expect(result.telemetry.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
    // Telemetry carries hashes/counters only — no prompt or manuscript text.
    expect(JSON.stringify(result.telemetry)).not.toContain("مات القبطان");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("budget envelope is decremented on a fixture attempt", async () => {
    const client = new OpenRouterClient({ fetchImpl: vi.fn() as unknown as typeof fetch });
    const envelope = budget();
    await client.chatCompletion({
      model: null,
      messages: [{ role: "user", content: "x" }],
      purpose: "extract",
      recordingKey: "extract-chapter-1",
      budget: envelope,
    });
    expect(envelope.callsUsed).toBe(1);
    expect(envelope.remainingCalls).toBe(19);
  });

  it("exhausted budget fails with JOB_BUDGET_EXHAUSTED before serving", async () => {
    const client = new OpenRouterClient({ fetchImpl: vi.fn() as unknown as typeof fetch });
    const envelope = new JobBudgetEnvelope({ maxCalls: 0, maxTokens: 100000, maxSeconds: 600 });
    await expect(
      client.chatCompletion({
        model: null,
        messages: [{ role: "user", content: "x" }],
        purpose: "extract",
        recordingKey: "extract-chapter-1",
        budget: envelope,
      }),
    ).rejects.toMatchObject({ code: "JOB_BUDGET_EXHAUSTED" });
  });
});
