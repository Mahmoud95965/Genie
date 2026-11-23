# Genie Story-World: Live Run Commands (for the later approved live run)

Built offline 2026-11-23 (M1 smoke): `storyworld/scripts/run-live-extraction.ts` + `storyworld/scripts/review-accept.ts`, store snapshot, 48 new tests. `npm test`: 162/162 green, zero network calls. Nothing pushed; live config still disabled.

Do NOT run these until the owner has separately approved: the §5 config values, the verified provider (§3c), and the §4 privacy setting checked that day.

Run from `~/workspace/genie-website`:

```bash
# 1. Build the runner scripts (one-time; output lands in git-ignored storyworld/local/.build)
npx tsc storyworld/scripts/run-live-extraction.ts storyworld/scripts/review-accept.ts --module commonjs --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck --outDir storyworld/local/.build --rootDir .

# 2. Load the key from .env into the shell (the client reads process.env.OPENROUTER_API_KEY)
set -a; source .env; set +a

# 3. Extract chapter 1 (live) — story file must be at storyworld/local/chapter-1.txt
node storyworld/local/.build/storyworld/scripts/run-live-extraction.js --file storyworld/local/chapter-1.txt --chapter-seq 1 --title "<story title>" --live --privacy-confirmed

# 4. Write decisions JSON (accept/reject per itemId; ambiguous needs chosenOccurrence [start,end]; reject needs reason), then review → commit → checker
node storyworld/local/.build/storyworld/scripts/review-accept.js --batch storyworld/local/review-batch-<timestamp>.json --story storyworld/local/chapter-1.txt --decisions storyworld/local/decisions-1.json

# 5. Repeat per chapter (--chapter-seq 2, 3, ...); storyworld/local/store.json carries committed state forward.
```

Notes:
- Compiling with `--moduleResolution node` prints 4 errors in pre-existing files (`config.ts`, `evidence.ts`, `queue.ts`) — artifacts of the ad-hoc flags, not real errors; the project's own `npx tsc --noEmit -p tsconfig.json` is clean, and emission still succeeds.
- Protections in the runner: exact `:free` slug + full pricing-object pre-flight (fails closed) before every dispatch + pinned no-fallback provider + max 3 chat dispatches + post-call cost flag. The config cap enforces nothing in code, and a 0/no-credit key as a server-side hard stop is unverified — no top-up or payment method is ever added.
- Story file, artifacts, store snapshots and findings stay in git-ignored `storyworld/local/` and never enter the public repo.
