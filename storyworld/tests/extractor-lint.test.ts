import { describe, expect, it } from "vitest";
import { lintExtraction } from "../lib/extractor/lint";

const ev = (quote: string) => [{ quote, start_offset: 0, end_offset: quote.length }];

describe("extractor lint (non-gating)", () => {
  it("flags a proposition whose evidence is a promise quote", () => {
    const q = "فوعده فرج إنه يعلمه بنفسه أول إجازة صيف";
    const w = lintExtraction({
      propositions: [{ local_id: "p1", statement: "فرج يعلم بدوي الجديف", evidence: ev(q) }],
      promises: [{ description: "x", evidence: ev(q) }],
      events: [], character_facts: [], knowledge: [],
    });
    expect(w.map((x) => x.code)).toContain("PROPOSITION_OVERLAPS_PROMISE");
  });
  it("flags intent cue words and uncovered cast, and empty propositions", () => {
    const w = lintExtraction(
      { propositions: [{ local_id: "p1", statement: "سعاد ناوية تتعلم", evidence: ev("ناوية تتعلم") }], promises: [], events: [], character_facts: [], knowledge: [] },
      ["سعاد", "رشدي"],
    );
    expect(w.map((x) => x.code)).toEqual(expect.arrayContaining(["PROPOSITION_HAS_INTENT_MARKER", "CAST_MEMBER_NOT_COVERED"]));
    expect(lintExtraction({ propositions: [] }).map((x) => x.code)).toContain("NO_PROPOSITIONS");
  });
  it("is silent on a clean extraction and tolerates junk input", () => {
    expect(lintExtraction({ propositions: [{ local_id: "p1", statement: "المركب خشبية", evidence: ev("مركبه الخشبية") }] })).toEqual([]);
    expect(() => lintExtraction(null)).not.toThrow();
  });
});
