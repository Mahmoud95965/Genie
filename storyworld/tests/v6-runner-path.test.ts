/**
 * v6 wiring through the REAL runner path (runReviewAccept / priorTimelineFromStore /
 * CLI parsers). Offline, no model calls. Extractions are hand-written (gold), so these
 * show what the pipeline does GIVEN correct extraction; they say nothing about a model.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildReviewBatchArtifact,
  loadAliasesFile,
  parseExtractionArgs,
  parseReviewAcceptArgs,
  priorTimelineFromStore,
  runReviewAccept,
  writeReviewBatchArtifact,
  type ExtractedArtifact,
} from "../lib/live-runner";
import { loadStoreSnapshotIfExists } from "../lib/store-snapshot";
import { verifyExtraction } from "../lib/extractor/evidence";
import { buildExtractorUserMessage } from "../lib/extractor/prompts";

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "v6-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true }); });

const ev = (b: string, q: string) => {
  const i = b.indexOf(q);
  if (i < 0 || b.indexOf(q, i + 1) >= 0) throw new Error("quote not unique: " + q);
  return [{ quote: q, start_offset: i, end_offset: i + q.length }];
};
const E = (b: string, id: string, kind: string, quote: string, who: Array<[string, string]>, s: number | null, e: number | null) => ({
  local_id: id, kind, summary: quote, participants: who.map(([character, role]) => ({ character, role })),
  location: null, story_time: null, span_start: s, span_end: e, reality_scope: "real", certainty: "asserted",
  evidence: ev(b, quote), knowledge_transfer: null, knowledge_use: null,
});
const X = (events: unknown[], character_facts: unknown[] = [], promises: unknown[] = []): Record<string, unknown> =>
  ({ propositions: [], events, knowledge: [], character_facts, promises });
const fake = (output: Record<string, unknown>, body: string): ExtractedArtifact => ({
  output, mode: "mock", attempt: 1, validationRetries: 0, modelRequested: "mock", modelResolved: null, provider: null,
  promptTokens: null, completionTokens: null, costUsd: null, costUsdSource: null, latencyMs: 0,
  dispatchCounts: { chatCompletions: 0, catalogFetches: 0, costLookups: 0, other: 0 },
  verification: verifyExtraction(body, output),
});
function review(dir: string, body: string, seq: number, output: Record<string, unknown>, decisions: unknown[], aliases?: Record<string, string>) {
  const storyPath = join(dir, `ch-${seq}.txt`);
  writeFileSync(storyPath, body, "utf-8");
  const { artifact } = buildReviewBatchArtifact({ extracted: fake(output, body), chapterBody: body, chapterSeq: seq, storyTitle: "v6" });
  const { jsonPath } = writeReviewBatchArtifact(dir, artifact);
  const decisionsPath = join(dir, `dec-${seq}.json`);
  writeFileSync(decisionsPath, JSON.stringify({ batchId: artifact.batchId, decisions }), "utf-8");
  return runReviewAccept({ artifactPath: jsonPath, storyPath, decisionsPath, storePath: join(dir, "store.json"), outDir: dir, ...(aliases ? { characterAliases: aliases } : {}) });
}
const acceptAll = (output: Record<string, unknown>) => {
  const d: unknown[] = [];
  for (const sec of ["propositions", "events", "knowledge", "character_facts", "promises"]) {
    ((output[sec] as unknown[]) ?? []).forEach((_, i) => d.push({ itemId: `$.${sec}[${i}]`, decision: "accept" }));
  }
  return d;
};

const B1 = "توفي الحاج منصور يوم الاثنين.";
const B2 = "أبو كمال ضحك وصافح الناس.";
const ch1 = () => X([E(B1, "e1", "death", "توفي الحاج منصور", [["الحاج منصور", "subject"]], 1, 1)],
  [{ character: "الحاج منصور", kind: "dead", value: "مات", valid_from_event_local_id: "e1", evidence: ev(B1, "توفي الحاج منصور") }]);
const ch2 = () => X([E(B2, "e2", "action", "أبو كمال ضحك وصافح الناس", [["أبو كمال", "actor"]], 11, 11)]);

describe("aliases through runReviewAccept", () => {
  it("no map: alias is a separate character, finding missed", () => {
    const d = tmp();
    review(d, B1, 1, ch1(), acceptAll(ch1()));
    expect(review(d, B2, 2, ch2(), acceptAll(ch2())).findingsByRule).toEqual({});
  });
  it("explicit map reaches commitBatch: DEAD_ACTS confirmed", () => {
    const d = tmp();
    const al = { "أبو كمال": "الحاج منصور" };
    review(d, B1, 1, ch1(), acceptAll(ch1()), al);
    const s = review(d, B2, 2, ch2(), acceptAll(ch2()), al);
    expect(s.findingsByRule).toEqual({ DEAD_ACTS: 1 });
  });
  it("aliases file loader and CLI flags", () => {
    const d = tmp();
    const p = join(d, "a.json");
    writeFileSync(p, JSON.stringify({ "أبو كمال": "الحاج منصور" }));
    const loaded = loadAliasesFile(p);
    expect(Object.getPrototypeOf(loaded)).toBeNull();
    expect({ ...loaded }).toEqual({ "أبو كمال": "الحاج منصور" });
    writeFileSync(p, JSON.stringify({ a: "b", b: "c" }));
    expect(() => loadAliasesFile(p)).toThrow(/chain/);
    writeFileSync(p, '{"__proto__": "الحاج منصور"}');
    expect(() => loadAliasesFile(p)).toThrow(/reserved/);
    writeFileSync(p, '{"أبو كمال": "__proto__"}');
    expect(() => loadAliasesFile(p)).toThrow(/reserved/);
    writeFileSync(p, "[]");
    expect(() => loadAliasesFile(p)).toThrow(/object/);
    expect(parseReviewAcceptArgs(["--batch", "b", "--story", "s", "--decisions", "d", "--aliases", "a.json"]).aliases).toBe("a.json");
    expect(parseExtractionArgs(["--file", "f", "--store", "st.json"]).store).toBe("st.json");
  });
});

describe("prior timeline from committed state", () => {
  it("empty without a store; lists committed events after a commit; reaches the extractor message", () => {
    const d = tmp();
    expect(priorTimelineFromStore(join(d, "store.json"))).toEqual([]);
    review(d, B1, 1, ch1(), acceptAll(ch1()));
    const tl = priorTimelineFromStore(join(d, "store.json"));
    expect(tl).toHaveLength(1);
    expect(tl[0]).toMatchObject({ spanStart: 1, spanEnd: 1 });
    expect(buildExtractorUserMessage({ chapterBody: "x", chapterSeq: 2, storyOrderBase: 10, cast: [], priorTimeline: tl })).toContain("[1, 1]");
  });
  it("only reviewer-accepted events appear (rejected ones do not)", () => {
    const d = tmp();
    const out = X([E(B1, "e1", "death", "توفي الحاج منصور", [["الحاج منصور", "subject"]], 1, 1)]);
    review(d, B1, 1, out, [{ itemId: "$.events[0]", decision: "reject", reason: "test" }]);
    expect(priorTimelineFromStore(join(d, "store.json"))).toEqual([]);
  });
});

describe("promise limits, tested not inferred", () => {
  const P1 = "وعد كمال إنه يسدد الدين قبل العيد. والعيد جاي.";
  const promise = (deadline: string | null) => ({
    description: "كمال يسدد الدين", raised_at_event_local_id: "e1", deadline_event_local_id: deadline, deadline_condition: null,
    status_change: "raised", resolved_at_event_local_id: null, evidence: ev(P1, "وعد كمال إنه يسدد الدين قبل العيد"),
  });
  const p1 = (deadline: string | null) => X(
    [E(P1, "e1", "promise_raised", "وعد كمال إنه يسدد الدين قبل العيد", [["كمال", "actor"]], 1, 1), E(P1, "e2", "other", "والعيد جاي", [["كمال", "observer"]], 4, 4)],
    [], [promise(deadline)]);
  const C = "جه العيد وعدى.";
  const later = () => X([E(C, "e3", "other", "جه العيد وعدى", [["كمال", "observer"]], 20, 20)]);

  it("deadline event first appearing in a LATER chapter cannot be linked from the promise chapter (commit fails)", () => {
    const d = tmp();
    expect(() => review(d, P1, 1, p1("e9"), acceptAll(p1("e9")))).toThrow(/unknown deadline event/);
  });
  it("deadline event in the same chapter: open promise past it is flagged overdue", () => {
    const d = tmp();
    review(d, P1, 1, p1("e2"), acceptAll(p1("e2")));
    const s = review(d, C, 2, later(), acceptAll(later()));
    expect(s.findingsByRule).toEqual({ PROMISE_OVERDUE: 1 });
  });
  it("a promise fulfilled later but with no reviewer-chosen target stays open: false overdue alarm remains; resolution cannot be accepted without a target", () => {
    const d = tmp();
    review(d, P1, 1, p1("e2"), acceptAll(p1("e2")));
    const F = "كمال سدد الدين قبل العيد.";
    const out = X([E(F, "e3", "action", "كمال سدد الدين", [["كمال", "actor"]], 3, 3)], [], [{
      description: "كمال سدد الدين", raised_at_event_local_id: "e3", deadline_event_local_id: null, deadline_condition: null,
      status_change: "fulfilled", resolved_at_event_local_id: "e3", evidence: ev(F, "كمال سدد الدين"),
    }]);
    // accepting the resolution without a target is refused (manual choice required)
    expect(() => review(tmp(), F, 2, out, [])).not.toThrow(); // nothing accepted, nothing committed
    const d2 = tmp();
    review(d2, P1, 1, p1("e2"), acceptAll(p1("e2")));
    expect(() => review(d2, F, 2, out, acceptAll(out))).toThrow(/target promise/);
    // a later chapter exists, the promise is still open, so the overdue finding stands
    const d3 = tmp();
    review(d3, P1, 1, p1("e2"), acceptAll(p1("e2")));
    const s = review(d3, C, 2, later(), acceptAll(later()));
    expect(s.findingsByRule.PROMISE_OVERDUE).toBe(1);
  });
  it("with a reviewer-chosen target the fulfilled promise is cleared: no overdue finding", () => {
    const d = tmp();
    review(d, P1, 1, p1("e2"), acceptAll(p1("e2")));
    const snap = loadStoreSnapshotIfExists(join(d, "store.json"));
    const promiseId = (snap as unknown as { ledger: { promises: Array<{ id: string }> } }).ledger.promises[0].id;
    const F = "كمال سدد الدين قبل العيد.";
    const out = X([E(F, "e3", "action", "كمال سدد الدين", [["كمال", "actor"]], 3, 3)], [], [{
      description: "كمال سدد الدين", raised_at_event_local_id: "e3", deadline_event_local_id: null, deadline_condition: null,
      status_change: "fulfilled", resolved_at_event_local_id: "e3", evidence: ev(F, "كمال سدد الدين"),
    }]);
    const dec = acceptAll(out).map((x) => ((x as { itemId: string }).itemId.startsWith("$.promises") ? { ...(x as object), targetPromiseId: promiseId } : x));
    const s = review(d, F, 2, out, dec);
    expect(s.findingsByRule.PROMISE_OVERDUE ?? 0).toBe(0);
  });
});
