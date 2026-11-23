/**
 * run-live-extraction.ts — extract only (brief section 2a).
 *
 * Reads ONE story chapter file, extracts with the runner's own
 * OpenRouterClient (or the deterministic mock by default), and writes
 * a schema-versioned review-batch artifact (JSON + MD) to
 * `storyworld/local/` (default). Never commits, never runs the
 * checker, never fabricates cast entries.
 *
 * Usage (from the repo root):
 *   node storyworld/local/.build/storyworld/scripts/run-live-extraction.js \
 *     --file storyworld/local/chapter-1.txt --chapter-seq 1 [--title "Story"]
 *   # live (separate approval step only):
 *   ... --live --privacy-confirmed
 *
 * `--mock` is the default: no network, no key. `--live` refuses
 * without `--privacy-confirmed` and without every live prerequisite
 * (section 3 of the brief). No payment of any kind is ever made.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loadConfig } from "../lib/config";
import {
  assertLivePrerequisites,
  buildReviewBatchArtifact,
  CountingFetch,
  LiveRunnerError,
  parseExtractionArgs,
  runExtraction,
  runMockExtraction,
  writeReviewBatchArtifact,
} from "../lib/live-runner";

async function main(): Promise<void> {
  const cwd = process.cwd();
  const cli = parseExtractionArgs(process.argv.slice(2));
  const config = loadConfig(join(cwd, "storyworld.config.json"));
  if (!existsSync(cli.file)) {
    throw new LiveRunnerError("VALIDATION_FAILED", `no story file at ${cli.file}`);
  }
  const storyBody = readFileSync(cli.file, "utf-8");
  const outDir = cli.outDir ?? join(cwd, "storyworld", "local");

  let extracted: ReturnType<typeof runMockExtraction>;
  if (cli.mode === "mock") {
    extracted = runMockExtraction({ chapterBody: storyBody, chapterSeq: cli.chapterSeq });
  } else {
    const { slug, provider } = assertLivePrerequisites(config, {
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    });
    const countingFetch = new CountingFetch(fetch);
    extracted = await runExtraction(
      { countingFetch, config },
      {
        chapterBody: storyBody,
        chapterSeq: cli.chapterSeq,
        storyOrderBase: cli.storyOrderBase,
        cast: [],
        model: slug,
        provider,
      },
    );
  }

  const { artifact } = buildReviewBatchArtifact({
    extracted,
    chapterBody: storyBody,
    chapterSeq: cli.chapterSeq,
    storyTitle: cli.storyTitle,
  });
  const { jsonPath, mdPath } = writeReviewBatchArtifact(outDir, artifact);

  console.log(`0 entries committed — awaiting human acceptance. Artifact: ${jsonPath}`);
  console.log(`Mode: ${artifact.mode}; batch: ${artifact.batchId}`);
  console.log(
    `Items: ${artifact.items.length} pending ` +
      `(${artifact.verification.verified} verified, ${artifact.verification.rejected} rejected evidence)`,
  );
  console.log(`Model: ${artifact.modelRequested ?? "—"} (resolved: ${artifact.modelResolved ?? "—"})`);
  console.log(`Cost (USD): ${artifact.extractor.costUsd === null ? "NULL (unknown)" : artifact.extractor.costUsd}`);
  if (artifact.extractor.costUsd !== null && artifact.extractor.costUsd !== 0) {
    console.log(
      `UNEXPECTED CHARGE — cost is ${artifact.extractor.costUsd} USD, expected 0. Do not proceed without owner review.`,
    );
  }
  console.log(`Summary: ${mdPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
