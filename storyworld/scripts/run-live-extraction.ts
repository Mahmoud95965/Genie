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
  AttemptLedger,
  buildReviewBatchArtifact,
  CountingFetch,
  LiveRunnerError,
  parseExtractionArgs,
  runExtraction,
  runMockExtraction,
  storySha256,
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
    const prereq = assertLivePrerequisites(config, {
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    });
    const { slug, provider } = prereq;
    const countingFetch = new CountingFetch(fetch);
    // D2: durable per-attempt dispatch budget. Acquired BEFORE any
    // network work and held until the run finishes; the lock is
    // released in finally, the ledger file itself is never removed.
    const ledger = AttemptLedger.acquire({
      dir: outDir,
      attemptId: cli.attemptId as string,
      chapterSeq: cli.chapterSeq,
      storySha256: storySha256(storyBody),
    });
    try {
      extracted = await runExtraction(
        { countingFetch, config, attemptLedger: ledger },
        {
          chapterBody: storyBody,
          chapterSeq: cli.chapterSeq,
          storyOrderBase: cli.storyOrderBase,
          cast: [],
          model: slug,
          provider,
          api: prereq.api,
          apiKeyEnvVar: prereq.apiKeyEnvVar,
          staticPrices: prereq.staticPrices,
        },
      );
    } finally {
      ledger.release();
    }
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
  const code = error instanceof LiveRunnerError ? error.code : "FATAL";
  if (code === "RATE_LIMITED") {
    process.exit(3); // stop condition reached; the ledger carries the not-before time
  }
  if (code === "BUDGET_EXHAUSTED") {
    process.exit(4); // attempt over; a further run needs a new owner-approved attempt id
  }
  process.exit(1);
});
