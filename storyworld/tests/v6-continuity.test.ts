/**
 * v6 continuity diagnostics — offline, no model calls. Hand-written GOLD
 * extractions: these show what the rules do GIVEN correct extraction, not
 * what a model produces. Same author as the code under test; not independent.
 */
import { describe, expect, it } from "vitest";
import { buildExtractorUserMessage } from "../lib/extractor/prompts";
import { runChecker } from "../lib/checker/run";
import { commitBatch } from "../lib/review/commit";
import { ReviewQueue } from "../lib/review/queue";
import { InMemoryStoryworldRepository } from "../lib/state/memory-store";

type Q = { quote: string; start_offset: number; end_offset: number };
const ev = (b: string, q: string): Q[] => {
  const i = b.indexOf(q);
  if (i < 0 || b.indexOf(q, i + 1) >= 0) throw new Error("quote not unique: " + q);
  return [{ quote: q, start_offset: i, end_offset: i + q.length }];
};
const E = (b: string, id: string, kind: string, quote: string, who: Array<[string, string]>, s: number | null, e: number | null, loc: string | null = null) => ({
  local_id: id, kind, summary: quote, participants: who.map(([character, role]) => ({ character, role })),
  location: loc, story_time: null, span_start: s, span_end: e, reality_scope: "real", certainty: "asserted",
  evidence: ev(b, quote), knowledge_transfer: null, knowledge_use: null,
});
const X = (events: unknown[], character_facts: unknown[] = [], promises: unknown[] = []) =>
  ({ propositions: [], events, knowledge: [], character_facts, promises });

function commitAll(chapters: Array<{ body: string; out: unknown }>, aliases?: Record<string, string>) {
  const repo = new InMemoryStoryworldRepository();
  const { branch } = repo.createProject("v6c");
  const q = new ReviewQueue();
  const kp = new Map<string, string>(), ke = new Map<string, string>();
  const failures: unknown[] = [];
  chapters.forEach((c, i) => {
    const { revision } = repo.createChapter(branch.id, { seq: i + 1, body: c.body, source: "import", expectedHead: repo.getHead(branch.id) });
    const batch = q.createBatch({ body: c.body, output: c.out as never, chapterRevisionId: revision.id, fixtureId: "v6c", chapterSeq: i + 1 });
    for (const it of batch.items) q.accept(batch.id, it.id);
    const r = commitBatch(q, batch.id, repo, { branchId: branch.id, expectedHead: repo.getHead(branch.id), knownPropositions: kp, knownEvents: ke, characterAliases: aliases });
    for (const [l, id] of r.mappings.propositions) kp.set(l, id);
    for (const [l, id] of r.mappings.events) ke.set(l, id);
  });
  return { findings: runChecker(repo, branch.id, {}), failures };
}

const B1 = "توفي الحاج منصور يوم الاثنين.";
const B2 = "أبو كمال ضحك وصافح الناس.";
const dead = (b: string) => [{ character: "الحاج منصور", kind: "dead", value: "مات", valid_from_event_local_id: "e1", evidence: ev(b, "توفي الحاج منصور") }];

describe("alias map (explicit, caller-supplied)", () => {
  const chapters = (actor: string) => [
    { body: B1, out: X([E(B1, "e1", "death", "توفي الحاج منصور", [["الحاج منصور", "subject"]], 1, 1)], dead(B1)) },
    { body: B2, out: X([E(B2, "e2", "action", "أبو كمال ضحك وصافح الناس", [[actor, "actor"]], 11, 11)]) },
  ];
  it("without a map the alias is a different character: finding missed", () => {
    expect(commitAll(chapters("أبو كمال")).findings.filter((f) => f.ruleCode === "DEAD_ACTS")).toHaveLength(0);
  });
  it("with an explicit map the alias merges: DEAD_ACTS confirmed", () => {
    const f = commitAll(chapters("أبو كمال"), { "أبو كمال": "الحاج منصور" }).findings.filter((x) => x.ruleCode === "DEAD_ACTS");
    expect(f).toHaveLength(1);
    expect(f[0].confidence).toBe("confirmed");
  });
  it("an unmapped near-name is never guessed", () => {
    expect(commitAll(chapters("أبو كمال"), { "أبو علي": "الحاج منصور" }).findings.filter((f) => f.ruleCode === "DEAD_ACTS")).toHaveLength(0);
  });
});

describe("cross-chapter TWO_PLACES and promise deadlines, given gold numbering", () => {
  it("TWO_PLACES fires across chapters only when both chapters use the same interval numbers", () => {
    const a = "السبت كانت ليلى في سوق المنيا.", b = "السبت كانت ليلى في بيت جدتها في أسوان.";
    const mk = (s2: number) => [
      { body: a, out: X([E(a, "e1", "action", "كانت ليلى في سوق المنيا", [["ليلى", "actor"]], 5, 6, "المنيا")]) },
      { body: b, out: X([E(b, "e2", "action", "كانت ليلى في بيت جدتها في أسوان", [["ليلى", "actor"]], s2, s2 + 1, "أسوان")]) },
    ];
    expect(commitAll(mk(5)).findings.filter((f) => f.ruleCode === "TWO_PLACES")).toHaveLength(1);
    // model-style per-chapter numbering (different base): the contradiction is invisible
    expect(commitAll(mk(25)).findings.filter((f) => f.ruleCode === "TWO_PLACES")).toHaveLength(0);
  });
  it("C6: promise with a 'before Eid' deadline event in the same chapter is overdue once later story order exists", () => {
    const a = "وعد كمال إنه يسدد الدين قبل العيد. والعيد جاي.";
    const c = "جه العيد وعدى، وكمال لسه ما سددش.";
    const out1 = X(
      [E(a, "e1", "promise_raised", "وعد كمال إنه يسدد الدين قبل العيد", [["كمال", "actor"]], 1, 1), E(a, "e2", "other", "والعيد جاي", [["كمال", "observer"]], 4, 4)],
      [],
      [{ description: "كمال يسدد الدين", raised_at_event_local_id: "e1", deadline_event_local_id: "e2", deadline_condition: null, status_change: "raised", resolved_at_event_local_id: null, evidence: ev(a, "وعد كمال إنه يسدد الدين قبل العيد") }],
    );
    const out2 = X([E(c, "e3", "action", "كمال لسه ما سددش", [["كمال", "actor"]], 20, 20)]);
    const f = commitAll([{ body: a, out: out1 }, { body: c, out: out2 }]).findings.filter((x) => x.ruleCode === "PROMISE_OVERDUE");
    expect(f).toHaveLength(1);
  });
});

describe("prior timeline in the extractor message", () => {
  it("default message is unchanged", () => {
    const m = buildExtractorUserMessage({ chapterBody: "نص", chapterSeq: 2, storyOrderBase: 10, cast: [] });
    expect(m).not.toContain("Earlier committed events");
  });
  it("lists earlier events with their intervals when supplied", () => {
    const m = buildExtractorUserMessage({ chapterBody: "نص", chapterSeq: 2, storyOrderBase: 10, cast: [], priorTimeline: [{ summary: "ليلى في المنيا", spanStart: 5, spanEnd: 6 }, { summary: "بلا فترة", spanStart: null, spanEnd: null }] });
    expect(m).toContain("[5, 6] ليلى في المنيا");
    expect(m).not.toContain("بلا فترة");
  });
});
