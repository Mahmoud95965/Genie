/**
 * M0 offset tests (spec 10.2): slice every fixture quote against its
 * chapter body — all equal, NFC code points. Fully offline.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  codePointLength,
  codePointToUtf16Index,
  normalizeBody,
  sliceByCodePoints,
  utf16ToCodePointIndex,
} from "../lib/extractor/evidence";

const ROOT = process.cwd();

interface FixtureFile {
  fixture_id: string;
  chapters: Array<{
    seq: number;
    body: string;
    expected_extraction: {
      propositions: Array<{ evidence: Array<{ quote: string; start_offset: number; end_offset: number }> }>;
      events: Array<{ evidence: Array<{ quote: string; start_offset: number; end_offset: number }> }>;
      knowledge: Array<{ evidence: Array<{ quote: string; start_offset: number; end_offset: number }> }>;
      character_facts: Array<{ evidence: Array<{ quote: string; start_offset: number; end_offset: number }> }>;
      promises: Array<{ evidence: Array<{ quote: string; start_offset: number; end_offset: number }> }>;
    };
  }>;
}

function loadFixture(): FixtureFile {
  return JSON.parse(
    readFileSync(join(ROOT, "storyworld", "fixtures", "dev-short-story", "fixture.json"), "utf-8"),
  ) as FixtureFile;
}

describe("fixture evidence offsets (NFC code points)", () => {
  it("slices every fixture quote equal to its chapter body (11 spans)", () => {
    const fixture = loadFixture();
    let count = 0;
    for (const chapter of fixture.chapters) {
      const body = normalizeBody(chapter.body);
      expect(chapter.body).toBe(body); // fixture bodies are already NFC
      const ex = chapter.expected_extraction;
      const spans: Array<{ quote: string; start_offset: number; end_offset: number }> = [];
      for (const section of ["propositions", "events", "knowledge", "character_facts", "promises"] as const) {
        for (const item of ex[section]) spans.push(...item.evidence);
      }
      for (const span of spans) {
        count += 1;
        expect(sliceByCodePoints(body, span.start_offset, span.end_offset)).toBe(span.quote);
        expect(span.end_offset - span.start_offset).toBe(codePointLength(span.quote));
      }
    }
    expect(count).toBe(11);
  });

  it("converts code-point offsets to UTF-16 indices and back", () => {
    // "خبّا" contains a combining shadda: 4 code points, 4 UTF-16 units
    // here (all BMP), but an astral character proves the conversion.
    const text = "a\u{1F600}b"; // a, emoji (2 UTF-16 units), b
    expect(codePointLength(text)).toBe(3);
    expect(codePointToUtf16Index(text, 0)).toBe(0);
    expect(codePointToUtf16Index(text, 1)).toBe(1);
    expect(codePointToUtf16Index(text, 2)).toBe(3);
    expect(codePointToUtf16Index(text, 3)).toBe(4);
    expect(utf16ToCodePointIndex(text, 3)).toBe(2);
    expect(sliceByCodePoints(text, 1, 2)).toBe("\u{1F600}");
    expect(() => codePointToUtf16Index(text, 4)).toThrow(RangeError);
  });

  it("NFC-normalizes combining sequences before slicing", () => {
    // e + combining acute (2 code points) normalizes to é (1 code point).
    const decomposed = "cafe\u0301";
    const body = normalizeBody(decomposed);
    expect(codePointLength(body)).toBe(4);
    expect(sliceByCodePoints(body, 3, 4)).toBe("é");
  });
});
