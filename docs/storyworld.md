# Story-World Consistency Engine — M0 + M1

Genie's Story-World Consistency Engine wraps an LLM (via OpenRouter) with an
explicit, evolving **world state** behind the chapters of a story: typed
events, character facts, who knows which proposition, and open promises —
each backed by a verbatim evidence quote with verified offsets. A checker
flags contradictions with evidence and confidence, and a human decides
repairs. The full specification is revision 2 of the Genie story-world
handoff (the spec file the owner supplied).

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

## What M1 is

M1 is the offline ledger + review + checker, all in memory or local
files — **no live calls, no real database, no UI, no public demo**:

- **Repository + commit ledger** — `storyworld/lib/state/`: a
  `StoryworldRepository` interface with an in-memory implementation
  (a Postgres one can replace it later). Entities per spec section 3:
  commits (linear, `commit_seq`, one `main` branch), events,
  participants, character facts, knowledge, knowledge uses, promises,
  propositions, evidence. Append-only: rows are never updated or
  deleted; retractions are new rows. A commit groups accepted items
  atomically under an optimistic head check (`HEAD_CONFLICT` on a stale
  head, never a silent overwrite); repeated idempotency keys return the
  original commit. Branching throws `BRANCHING_DISABLED` until M3.
  Chapters are immutable revisions with chapter heads, created inside
  their own commit.
- **Extraction review queue** — `storyworld/lib/review/`: candidates
  from the worker become pending items. Only evidence-verified items
  (spec 6.5, reusing the M0 verifier) can be accepted; accept/reject is
  explicit per item; a commit groups the accepted items and rejected
  items are kept with a reason. Ambiguous quotes stay flagged and need
  an explicit choice of occurrence, recorded — never silently picked.
  Cross-chapter local-id references (the fixture uses globally unique
  local ids) are resolved through caller-supplied known-id maps.
- **Projections** — `storyworld/lib/state/projections.ts`: pure
  functions equivalent to the spec's `v_current_events`,
  `v_current_character_facts`, `v_current_knowledge` and
  `v_current_promises` (status from the latest resolution, default
  open), derived from accepted commits only, filtering retracted
  entries.
- **Rule checker** — `storyworld/lib/checker/rules.ts`: pure functions,
  no LLM. `DEAD_ACTS`, `KNOWLEDGE_LEAK`, `TWO_PLACES`,
  `PROMISE_OVERDUE`, and `LOCATION_TELEPORT` (advisory only, always
  `uncertain`), following spec section 7 semantics: latest applicable
  life-state selection (a resurrection is a new `alive` fact; the death
  fact stays as history), strict `<` except witnessed same-instant for
  knowledge, interval overlap with all bounds known for two places,
  null bounds never confirm, open-world missing knowledge is not proof
  (confirmed only for closed-world propositions or an explicit
  evidenced record of non-knowledge), non-asserted or non-real events
  never confirm. Findings store rule id, confidence, dual evidence
  quotes with offsets, and the commit they were raised on
  (`storyworld/lib/checker/run.ts` runs the checker and stores
  findings; re-running on the same head does not duplicate them).
- **Tests** — spec 10.2 M1 rows: synthetic checker cases including all
  negatives (resurrection, flashback, adjacent intervals, null bounds,
  closed vs open world, unknown use time, witnessed same-instant), plus
  an end-to-end test that commits the dev fixture's gold state and runs
  the checker: exactly the fixture's expected findings (1 `DEAD_ACTS`
  confirmed on e4/e1, 1 `KNOWLEDGE_LEAK` confirmed on e6/كريم/p1,
  0 `PROMISE_OVERDUE`, 0 `TWO_PLACES`, e7 not flagged). The fixture's
  expected findings are test targets for the implementation, NOT an
  accuracy metric. The M0 demo job test is labelled a plumbing test:
  it replays a recording and passes by construction.

## What is NOT built yet (M2+)

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

**No real model has ever been run on this.** Every extraction so far
replayed a recorded fixture; the M0 demo job and the M1 end-to-end test
pass by construction against gold data. There is no accuracy number,
and none is claimed.

## Open questions (M1)

These came up while implementing M1 and were not silently decided:

1. **LOCATION_TELEPORT — "distant" is undefined.** The spec has no
   location or distance model, so "distant locations" cannot be
   determined from free-text location strings. The rule is implemented
   with a caller-supplied `isDistant` predicate and yields no findings
   without one.
2. **Promise resolutions have no defined mapping.** The extractor
   schema allows `status_change` of `fulfilled` / `violated` /
   `abandoned`, but the spec never defines how such an item maps to
   `promise_entries` vs `promise_resolutions` — the output carries no
   promise identity to resolve against. M1 accepts only `raised` and
   rejects the rest at commit time with a per-item validation error.
3. **Explicit records of non-knowledge have no ledger representation.**
   The spec names them as a confirmed-basis for `KNOWLEDGE_LEAK` but
   defines no table for them. M1 accepts them only as a
   caller-supplied checker option, not as stored state.
4. **DEAD_ACTS tie-breaks.** Two life-state facts with equal `span_end`
   in the same commit are unspecified by the spec SQL (it orders by
   `span_end desc, commit_seq desc`); M1 breaks ties by insertion order
   (later inserted wins). Also: a resurrection event that casts the
   character as actor/speaker is itself flagged by the spec SQL (its
   own alive fact ends at the same story point, and the strict `<`
   excludes it) — the resurrection must be represented as an observed
   event for the later act to clear.
5. **TWO_PLACES touching intervals.** The overlap formula uses `<=`,
   so intervals sharing one endpoint count as overlapping. Followed
   literally.
6. **KNOWLEDGE_LEAK learn-event reality.** The spec SQL does not filter
   the learn event by certainty/reality_scope; followed literally (only
   span order and channel conditions matter).

## How to run

```bash
npm test              # all M0+M1 tests, fully offline, zero network calls
npm run storyworld:m0 # offline demo job: extract chapter 1 end to end
npm run build         # Next.js production build (type-checks storyworld/* too)
```

## What M0+M1 do not involve

- **No live calls.** `live_calls.enabled` is `false`; no model slug is
  configured. Turning live calls on requires the owner to set a monthly
  USD cap and at least one fully priced approved model — the client
  refuses otherwise.
- **No real database.** The migration file is versioned text only; M1
  storage is in-memory behind an interface.
- **No deploy.** Nothing here is deployed or published.
- **No secrets.** No key or credential is stored anywhere in this repo;
  a live key would live only in server-side `OPENROUTER_API_KEY`, never
  in client code, logs, or the repo.
- **No manuscript text in logs.** Telemetry stores hashes and counters
  only (`prompt_sha256`, tokens, cost, latency).
