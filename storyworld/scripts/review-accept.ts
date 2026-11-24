/**
 * review-accept.ts — human decision → commit → checker (brief section 2b).
 *
 * Re-validates a review-batch artifact, re-checks the story SHA-256,
 * re-verifies every evidence span against the story as it is now,
 * applies the explicit decisions from `--decisions`, commits the
 * accepted items, runs the checker, saves the durable store snapshot,
 * and writes findings (JSON + MD).
 *
 * Usage (from the repo root):
 *   node storyworld/local/.build/storyworld/scripts/review-accept.js \
 *     --batch storyworld/local/review-batch-<ts>.json \
 *     --story storyworld/local/chapter-1.txt \
 *     --decisions storyworld/local/decisions-1.json
 *
 * `--store` defaults to `storyworld/local/store.json` (created if
 * absent); `--out` defaults to `storyworld/local/`. Nothing is
 * committed automatically: only items the decisions file explicitly
 * accepts are committed, and only after they re-verify.
 */
import { join } from "node:path";

import {
  loadAliasesFile,
  parseReviewAcceptArgs,
  renderReviewSummaryText,
  runReviewAccept,
} from "../lib/live-runner";

function main(): void {
  const cwd = process.cwd();
  const cli = parseReviewAcceptArgs(process.argv.slice(2));
  const outDir = cli.outDir ?? join(cwd, "storyworld", "local");
  const storePath = cli.store ?? join(cwd, "storyworld", "local", "store.json");
  const summary = runReviewAccept({
    artifactPath: cli.batch,
    storyPath: cli.story,
    decisionsPath: cli.decisions,
    storePath,
    outDir,
    author: cli.author ?? undefined,
    ...(cli.aliases ? { characterAliases: loadAliasesFile(cli.aliases) } : {}),
  });
  console.log(renderReviewSummaryText(summary));
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
