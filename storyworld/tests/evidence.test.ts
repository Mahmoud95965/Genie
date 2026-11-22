/**
 * M0 evidence-verification unit tests (spec 6.5).
 * - Unique match recomputes canonical offsets (model offsets advisory).
 * - Ambiguous quote rejected unless the model offsets select one occurrence.
 * - Missing quote rejected.
 * Fully offline.
 */
import { describe, expect, it } from "vitest";

import {
  normalizeBody,
  verifyEvidenceSpan,
  verifyExtraction,
} from "../lib/extractor/evidence";

describe("verifyEvidenceSpan", () => {
  const body = normalizeBody("قال عمر لليلى: أبويا خبّا الرسايل في المنارة. وقف عمر وليلى عند المنارة.");

  it("unique match recomputes canonical offsets, ignoring wrong model offsets", () => {
    const verdict = verifyEvidenceSpan(body, {
      quote: "قال عمر لليلى: أبويا خبّا الرسايل في المنارة",
      start_offset: 999,
      end_offset: 1000,
    });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.start_offset).toBe(0);
      expect(verdict.end_offset).toBe(44);
    }
  });

  it("ambiguous quote is rejected when model offsets select no occurrence", () => {
    // "عمر" occurs twice in the body.
    const verdict = verifyEvidenceSpan(body, { quote: "عمر", start_offset: 5, end_offset: 8 });
    expect(verdict).toEqual({ ok: false, quote: "عمر", reason: "ambiguous_quote" });
  });

  it("ambiguous quote is accepted when model offsets select one occurrence", () => {
    const first = verifyEvidenceSpan(body, { quote: "عمر", start_offset: 4, end_offset: 7 });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.start_offset).toBe(4);
      expect(first.end_offset).toBe(7);
    }
    const second = verifyEvidenceSpan(body, { quote: "عمر", start_offset: 50, end_offset: 53 });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.start_offset).toBe(50);
      expect(second.end_offset).toBe(53);
    }
  });

  it("missing quote is rejected", () => {
    const verdict = verifyEvidenceSpan(body, {
      quote: "جملة غير موجودة في النص",
      start_offset: 0,
      end_offset: 5,
    });
    expect(verdict).toEqual({
      ok: false,
      quote: "جملة غير موجودة في النص",
      reason: "quote_not_found",
    });
  });
});

describe("verifyExtraction", () => {
  const body = "في ليلة العاصفة مات القبطان سالم. وقف عمر وليلى عند المنارة.";

  it("verifies a well-formed extraction with canonical offsets", () => {
    const output = {
      propositions: [],
      events: [
        {
          local_id: "e1",
          kind: "death",
          summary: "مات القبطان سالم في ليلة العاصفة",
          participants: [{ character: "سالم", role: "victim" }],
          location: null,
          story_time: "ليلة العاصفة",
          span_start: 1,
          span_end: 1,
          reality_scope: "real",
          certainty: "asserted",
          // Deliberately wrong model offsets: unique match recomputes them.
          evidence: [{ quote: "مات القبطان سالم", start_offset: 0, end_offset: 1 }],
          knowledge_transfer: null,
          knowledge_use: null,
        },
      ],
      knowledge: [],
      character_facts: [],
      promises: [],
    };
    const result = verifyExtraction(body, output);
    expect(result.ok).toBe(true);
    expect(result.rejected).toEqual([]);
    expect(result.verified).toHaveLength(1);
    expect(result.verified[0].spans[0]).toEqual({
      quote: "مات القبطان سالم",
      start_offset: 16,
      end_offset: 32,
    });
  });

  it("rejects the item whose quote is missing, and keeps the good ones", () => {
    const output = {
      propositions: [],
      events: [
        {
          local_id: "e1",
          kind: "death",
          summary: "مات القبطان سالم",
          participants: [],
          location: null,
          story_time: null,
          span_start: 1,
          span_end: 1,
          reality_scope: "real",
          certainty: "asserted",
          evidence: [{ quote: "مات القبطان سالم", start_offset: 16, end_offset: 32 }],
          knowledge_transfer: null,
          knowledge_use: null,
        },
        {
          local_id: "eX",
          kind: "action",
          summary: "حدث غير موجود",
          participants: [],
          location: null,
          story_time: null,
          span_start: 9,
          span_end: 9,
          reality_scope: "real",
          certainty: "asserted",
          evidence: [{ quote: "طار سالم إلى القمر", start_offset: 0, end_offset: 5 }],
          knowledge_transfer: null,
          knowledge_use: null,
        },
      ],
      knowledge: [],
      character_facts: [],
      promises: [],
    };
    const result = verifyExtraction(body, output);
    expect(result.ok).toBe(false);
    expect(result.verified).toHaveLength(1);
    expect(result.verified[0].itemPath).toBe("$.events[0]");
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].itemPath).toBe("$.events[1]");
    expect(result.rejected[0].reason).toContain("quote_not_found");
  });
});
