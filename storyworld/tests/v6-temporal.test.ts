/**
 * Temporal numbering diagnostics, offline, no model calls. GOLD extractions written by the same
 * author as the code: they show what the checker does GIVEN a numbering, not what a model produces.
 */
import { describe, expect, it } from "vitest";
import { EXTRACTOR_PROFILES, EXTRACTOR_V4_PROMPT } from "../lib/extractor/profiles";
import { buildExtractorUserMessage } from "../lib/extractor/prompts";
import { runChecker } from "../lib/checker/run";
import { commitBatch } from "../lib/review/commit";
import { ReviewQueue } from "../lib/review/queue";
import { InMemoryStoryworldRepository } from "../lib/state/memory-store";
import { parseExtractionArgs, requireModalityForArtifact } from "../lib/live-runner";
import { validateExtractorOutput } from "../lib/extractor/validate";

const ev = (b: string, q: string) => {
  const i = b.indexOf(q);
  if (i < 0) throw new Error("missing quote " + q);
  return [{ quote: q, start_offset: i, end_offset: i + q.length }];
};
const E = (b: string, id: string, q: string, who: Array<[string, string]>, s: number | null, e: number | null) => ({
  local_id: id, kind: "action", summary: q, participants: who.map(([character, role]) => ({ character, role })),
  location: null, story_time: null, span_start: s, span_end: e, reality_scope: "real", certainty: "asserted",
  evidence: ev(b, q), knowledge_transfer: null, knowledge_use: null,
});
const B1 = "مات سالم ليلة الأربعاء.";
const B2 = "سالم كان قال لليلى سرا قبل ما يموت.";

function run(flashbackSpan: number | null) {
  const repo = new InMemoryStoryworldRepository();
  const { branch } = repo.createProject("t");
  const q = new ReviewQueue();
  const ke = new Map<string, string>(), kp = new Map<string, string>();
  const outs = [
    { body: B1, out: { propositions: [], events: [E(B1, "e1", "مات سالم", [["سالم", "subject"]], 3, 3)], knowledge: [], promises: [],
      character_facts: [{ character: "سالم", kind: "dead", value: "مات", valid_from_event_local_id: "e1", evidence: ev(B1, "مات سالم") }] } },
    { body: B2, out: { propositions: [], events: [E(B2, "e2", "سالم كان قال لليلى سرا", [["سالم", "speaker"], ["ليلى", "listener"]], flashbackSpan, flashbackSpan)], knowledge: [], promises: [], character_facts: [] } },
  ];
  outs.forEach((c, i) => {
    const { revision } = repo.createChapter(branch.id, { seq: i + 1, body: c.body, source: "import", expectedHead: repo.getHead(branch.id) });
    const batch = q.createBatch({ body: c.body, output: c.out as never, chapterRevisionId: revision.id, fixtureId: "t", chapterSeq: i + 1 });
    for (const it of batch.items) q.accept(batch.id, it.id);
    const r = commitBatch(q, batch.id, repo, { branchId: branch.id, expectedHead: repo.getHead(branch.id), knownPropositions: kp, knownEvents: ke });
    for (const [l, id] of r.mappings.events) ke.set(l, id);
  });
  return runChecker(repo, branch.id, {}).filter((f) => f.ruleCode === "DEAD_ACTS");
}

describe("event numbering vs DEAD_ACTS (checker behaviour GIVEN a numbering; gold input, same author)", () => {
  it("strictly before the death (end < death start): not flagged", () => {
    expect(run(2)).toHaveLength(0);
    expect(run(-5)).toHaveLength(0);
  });
  it("an event numbered after the death is flagged, whatever the text said (the observed failure shape)", () => {
    expect(run(4)).toHaveLength(1);
    expect(run(12)).toHaveLength(1);
  });
  it("an EQUAL number is an unresolved tie: the checker does not flag it, and that is NOT evidence the event was before the death", () => {
    expect(run(3)).toHaveLength(0);
  });
  it("unknown ordering (null span) is skipped by the checker: no finding, so a real post-death action with unknown order is not caught", () => {
    expect(run(null)).toHaveLength(0);
  });
});

describe("extractor.v4.1 profile", () => {
  it("keeps v4 schema and modality enforcement, adds only the numbering rule", () => {
    const a = EXTRACTOR_PROFILES["extractor.v4"], b = EXTRACTOR_PROFILES["extractor.v4.1"];
    expect(b.requireModality).toBe(true);
    expect(JSON.stringify(b.schema)).toBe(JSON.stringify(a.schema));
    expect(b.systemPrompt.startsWith(EXTRACTOR_V4_PROMPT)).toBe(true);
    expect(b.systemPrompt).toContain("Numbering follows when events HAPPEN");
    for (const part of ["ends strictly below", "overlaps it", "starts strictly above", "use null instead of guessing", "negative numbers are allowed"]) {
      expect(b.systemPrompt).toContain(part);
    }
    expect(b.systemPrompt).not.toContain("lower than or equal");
    expect(EXTRACTOR_PROFILES["extractor.v4"].systemPrompt).toBe(EXTRACTOR_V4_PROMPT);
  });
  it("is selectable from the CLI and unknown profiles still throw", () => {
    expect(parseExtractionArgs(["--file", "a.txt", "--extractor", "extractor.v4.1"]).extractorVersion).toBe("extractor.v4.1");
    expect(() => parseExtractionArgs(["--file", "a.txt", "--extractor", "extractor.v9"])).toThrow();
  });
  it("the user message still carries the earlier committed timeline the rule refers to", () => {
    const m = buildExtractorUserMessage({ chapterBody: "x", chapterSeq: 2, storyOrderBase: 10, cast: [], priorTimeline: [{ summary: "death", spanStart: 3, spanEnd: 3 }] });
    expect(m).toContain("[3, 3] death");
  });
});

describe("number domain and artifact version handling", () => {
  const base = { propositions: [], knowledge: [], character_facts: [], promises: [] };
  const evOut = (s: unknown, e: unknown) => ({ ...base, events: [{ ...E(B1, "e1", "مات سالم", [["سالم", "subject"]], 1, 1), span_start: s, span_end: e }] });
  it("schema and validator accept negative whole numbers and null, reject fractions", () => {
    expect(validateExtractorOutput(evOut(-3, -2), { requireModality: true }).valid).toBe(true);
    expect(validateExtractorOutput(evOut(null, null), { requireModality: true }).valid).toBe(true);
    expect(validateExtractorOutput(evOut(2.5, 2.5), { requireModality: true }).valid).toBe(false);
    const sp: any = (EXTRACTOR_PROFILES["extractor.v4.1"].schema as any).properties.events.items.properties.span_start;
    expect(sp.type).toEqual(["integer", "null"]);
  });
  it("artifact version: known profiles answer from the profile; unknown explicit version fails clearly, a missing one keeps legacy behaviour", () => {
    expect(requireModalityForArtifact("extractor.v3")).toBe(false);
    expect(requireModalityForArtifact("extractor.v4")).toBe(true);
    expect(requireModalityForArtifact("extractor.v4.1")).toBe(true);
    expect(() => requireModalityForArtifact("extractor.v99")).toThrow(/not a known profile/);
    // legacy artifact without a recorded version: previous behaviour kept (no modality requirement)
    expect(requireModalityForArtifact(undefined)).toBe(false);
    expect(requireModalityForArtifact(null)).toBe(false);
  });
});
