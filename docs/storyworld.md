# Story-World Consistency Engine — M0

Genie's Story-World Consistency Engine wraps an LLM (via OpenRouter) with an
explicit, evolving **world state** behind the chapters of a story: typed
events, character facts, who knows which proposition, and open promises —
each backed by a verbatim evidence quote with verified offsets. A checker
flags contradictions with evidence and confidence, and a human decides
repairs. The full specification lives in
`~/workspace/user/files/genie-storyworld-muse-handoff-5f16c2b7.md.txt`
(spec revision 2).

## What M0 is

M0 is the offline scaffold only — **one offline job runs end to end against
a recording; zero network calls**:

- **Config** — `storyworld.config.json` at the repo root (spec section 5):
  `deploy_mode: "local"`, all models `null`, `require_explicit_model: true`,
  `live_calls.enabled: false`, branching off, protective job-budget ceilings.
- **OpenRouter client** — `storyworld/lib/openrouter.ts`: request allowlist
  (only `model`, `messages`, `response_format`, `max_tokens`, `temperature`,
  `seed`, `provider`; no tools/plugins/web), structured-output support,
  telemetry of models/tokens/cost/latency/hashes only (never prompt or
  manuscript text), a job budget envelope decremented on every attempt
  including retries, and live-call gating — with live calls disabled it
  serves only recorded fixtures under `storyworld/fixtures/llm-recordings/`
  and fails anything else with `LIVE_CALLS_DISABLED`, before any fetch.
- **Extractor contract** — `storyworld/lib/extractor/`: prompt template
  `extractor.v2`, the `GenieExtractorOutput` JSON schema (spec 6.1,
  strict-mode shape), a hand-written structural validator, and evidence
  verification (spec 6.5): NFC-normalize the body, offsets are 0-based
  end-exclusive Unicode code points, unique match recomputes canonical
  offsets, ambiguous quotes need the model offsets to select one
  occurrence, missing quotes are rejected.
- **Jobs** — `storyworld/lib/jobs/`: in-memory/offline queue + worker
  (dequeue with lease, budget envelope, result/error written exactly once,
  idempotent by key, requeue at most twice on crash).
- **Migrations (file only)** —
  `storyworld/supabase/migrations/0001_storyworld.sql` contains the spec
  section 3 starter DDL verbatim. **It is not executed by default, and
  running migrations anywhere is not authorized by the spec.** No database
  exists for M0.
- **Fixtures** — `storyworld/fixtures/dev-short-story/fixture.json` (the
  spec 10.1 dev fixture: 3 Arabic chapters with exact texts, gold
  extractions, gold state, expected findings, closed-world proposition
  `p1`; chapter bodies are included alongside the spec's machine-readable
  JSON, which lists them as separate text blocks) and
  `storyworld/fixtures/llm-recordings/extract-chapter-1.json` (the recorded
  extractor response for chapter 1, equal to the gold extraction).

## What is NOT built yet (M1+)

- **M1 (not built):** extraction review queue, commit ledger, rule checker
  (`DEAD_ACTS`, `KNOWLEDGE_LEAK`, `TWO_PLACES`, `PROMISE_OVERDUE`,
  `LOCATION_TELEPORT`), projected state, findings. The expected findings
  in the dev fixture are targets for M1, not results of M0.
- **M2 (not built):** writer with state slices, repair proposer, private
  A/B evaluation on a held-out fixture.
- **M3 (not built):** branching UI — fork, side-by-side, conflict handling.
  Branching stays disabled (`branching.enabled: false`).
- **M4 (research only):** propagation of consequences after editing an
  early event. Never promised as a feature.
- There is **no public demo, no UI, and no nav item** for the engine yet.
  The website lists it as a venture ("In development") with honest copy
  only — see `src/data/projects.ts` (`storyworld`).

## Honesty requirement (spec section 7)

The checker covers only explicitly represented rules over correctly
extracted state. Extraction errors compound. **A clean run is not proof
of consistency.** No numbers from the dev fixture are reported anywhere:
it is a dev fixture, usable for prompt tuning, never the source of
reported results. A held-out fixture, written later by the owner, is the
only source of reported numbers.

## How to run

```bash
npm test              # all M0 tests, fully offline, zero network calls
npm run storyworld:m0 # offline demo job: extract chapter 1 end to end
npm run build         # Next.js production build (type-checks storyworld/* too)
```

## What M0 does not involve

- **No live calls.** `live_calls.enabled` is `false`; no model slug is
  configured. Turning live calls on requires the owner to set a monthly
  USD cap and at least one fully priced approved model — the client
  refuses otherwise.
- **No real database.** The migration file is versioned text only.
- **No deploy.** Nothing here is deployed or published.
- **No secrets.** No key or credential is stored anywhere in this repo;
  a live key would live only in server-side `OPENROUTER_API_KEY`, never
  in client code, logs, or the repo.
- **No manuscript text in logs.** Telemetry stores hashes and counters
  only (`prompt_sha256`, tokens, cost, latency).
