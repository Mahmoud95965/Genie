import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadCastFile, parseExtractionArgs } from "../lib/live-runner";
import { buildExtractorUserMessage } from "../lib/extractor/prompts";

function tmp(content: string): string {
  const p = join(mkdtempSync(join(tmpdir(), "cast-")), "cast.json");
  writeFileSync(p, content, "utf-8");
  return p;
}

describe("--cast", () => {
  it("loads names and passes them through the CLI parser", () => {
    const p = tmp(JSON.stringify(["سالم", "ليلى"]));
    expect(loadCastFile(p)).toEqual(["سالم", "ليلى"]);
    expect(parseExtractionArgs(["--file", "x.txt", "--cast", p]).cast).toEqual(["سالم", "ليلى"]);
  });
  it("defaults to empty cast", () => {
    expect(parseExtractionArgs(["--file", "x.txt"]).cast).toEqual([]);
  });
  it("rejects bad cast files", () => {
    expect(() => loadCastFile(tmp("{}"))).toThrow();
    expect(() => loadCastFile(tmp("[]"))).toThrow();
    expect(() => loadCastFile(tmp('["a","a"]'))).toThrow();
    expect(() => loadCastFile(tmp('["__proto__"]'))).toThrow();
    expect(() => loadCastFile(tmp("[1]"))).toThrow();
  });
  it("the extractor message lists the canonical cast", () => {
    const m = buildExtractorUserMessage({ chapterBody: "x", chapterSeq: 2, storyOrderBase: 10, cast: ["سالم", "ليلى"] } as never);
    expect(JSON.stringify(m)).toContain("سالم, ليلى");
  });
});
