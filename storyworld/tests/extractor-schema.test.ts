/**
 * M0 schema tests (spec 10.2): the fixture's `expected_extraction` blocks
 * validate against `GenieExtractorOutput`. Fully offline.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { validateExtractorOutput } from "../lib/extractor/validate";

const ROOT = process.cwd();

interface FixtureFile {
  fixture_id: string;
  chapters: Array<{ seq: number; expected_extraction: unknown }>;
}

function loadFixture(): FixtureFile {
  return JSON.parse(
    readFileSync(join(ROOT, "storyworld", "fixtures", "dev-short-story", "fixture.json"), "utf-8"),
  ) as FixtureFile;
}

describe("GenieExtractorOutput schema (fixture gold extractions)", () => {
  it("validates all 3 chapters' expected_extraction blocks", () => {
    const fixture = loadFixture();
    expect(fixture.fixture_id).toBe("dev-short-story-v1");
    expect(fixture.chapters).toHaveLength(3);
    for (const chapter of fixture.chapters) {
      const result = validateExtractorOutput(chapter.expected_extraction);
      expect(result.errors, `chapter ${chapter.seq} errors`).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it("rejects an output with an extra property (strict mode)", () => {
    const fixture = loadFixture();
    const bad = JSON.parse(JSON.stringify(fixture.chapters[0].expected_extraction)) as Record<
      string,
      unknown
    >;
    bad.unexpected = true;
    const result = validateExtractorOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "$.unexpected")).toBe(true);
  });

  it("rejects an event with an invalid kind enum value", () => {
    const fixture = loadFixture();
    const bad = JSON.parse(JSON.stringify(fixture.chapters[0].expected_extraction)) as {
      events: Array<Record<string, unknown>>;
    };
    bad.events[0].kind = "teleport";
    const result = validateExtractorOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "$.events[0].kind")).toBe(true);
  });

  it("rejects evidence with zero items (minItems 1)", () => {
    const fixture = loadFixture();
    const bad = JSON.parse(JSON.stringify(fixture.chapters[0].expected_extraction)) as {
      events: Array<{ evidence: unknown[] }>;
    };
    bad.events[0].evidence = [];
    const result = validateExtractorOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "$.events[0].evidence")).toBe(true);
  });

  it("rejects a missing required property", () => {
    const fixture = loadFixture();
    const bad = JSON.parse(JSON.stringify(fixture.chapters[1].expected_extraction)) as {
      propositions: Array<Record<string, unknown>>;
    };
    delete bad.propositions[0].statement;
    const result = validateExtractorOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "$.propositions[0].statement")).toBe(true);
  });
});
