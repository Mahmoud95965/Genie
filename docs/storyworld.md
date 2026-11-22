# Story-World Consistency Engine — M0 + M1 + M1.1

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
  `uncertain`), following spec section 7 semantics as amended by M1.1
  (see below): latest applicable life-state selection (a resurrection
  is a new `alive` fact; the death fact stays as history), with the
  own-event exception (the event that creates an `alive` fact is
  applicable at that same instant, recorded as a run note) and
  contradictory equal-point life-state ties reported `uncertain`
  instead of picking a winner; strict `<` except witnessed same-instant
  for knowledge, and a learn event that is non-asserted or non-real
  yields `uncertain` (`learned_only_in_non_real_event`) unless the
  reviewer marked it `learned_in_story`; two-places overlap with all
  bounds known, but a single shared endpoint is `uncertain`
  (`touching_interval`), not confirmed; null bounds never confirm;
  open-world missing knowledge is not proof (confirmed only for
  closed-world propositions, an explicit evidenced record of
  non-knowledge, or a stored `knowledge_denial`); non-asserted or
  non-real events never confirm. Findings store rule id, confidence,
  dual evidence quotes with offsets, and the commit they were raised on
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

## What M1.1 is

M1.1 implements the owner's approved decisions on the six M1 open
questions (proposal of 2026-11-23, approved in full the same day).
Same constraints as M1: offline, in memory, no live calls, no
migration, no site changes.

- **Item 1 — LOCATION_TELEPORT stays off.** "Distant" is still
  undefined in the spec; no decision was taken and none is needed.
  The rule remains advisory-only with a caller-supplied predicate.
- **Item 2 — Promise resolutions, reviewer picks the target.** A
  resolution candidate (`status_change` fulfilled/violated/abandoned)
  is a pending review item whose `target_promise_id` is unset and
  cannot be accepted until the reviewer selects one open promise from
  the current projection (`ReviewQueue.selectPromiseTarget`); no
  automatic matching by text similarity is ever done. The resulting
  `promise_resolutions` row carries that `promise_id`, the
  `resolved_at_event_id` and the status; the evidence span is the
  candidate's verified quote. A resolution without
  `resolved_at_event_local_id` is rejected at commit. Resolving an
  already-resolved promise adds a new resolution row (latest by
  `commit_seq` wins, per the spec view) but requires reviewer
  confirmation of the conflict first. Retracting a resolution returns
  the status to the previous one, or `open`. Known limitation: a
  resolution can only target a promise already in the current
  projection — a promise raised in the same batch cannot be resolved
  by the same batch (commit the raise first, then resolve later). The
  extractor schema, prompt and SQL are unchanged; the proposal's
  `target_promise_local_id` (extractor v3) was deferred.
- **Item 3 — Explicit non-knowledge records.** New ledger entry type
  `knowledge_denial` (in-memory only; SQL and extractor unchanged):
  character, proposition, stated-at event, commit, at least one
  evidence span. It goes through the review queue like other items
  (`ReviewQueue.addKnowledgeDenial`), is append-only and retractable,
  and confirms a `KNOWLEDGE_LEAK` only for uses at or after the stated
  event, with the use asserted, real and time known, and with no
  current knowledge entry learned before the use. A later clean
  learning (real + asserted, or reviewer-marked `learned_in_story`)
  clears it; a non-real learning after the denial is reported as the
  item-6 `uncertain` instead.
- **Item 4a — DEAD_ACTS resurrection own-event exception** (departs
  from the spec SQL). The event that creates an `alive` fact is that
  fact's "own event": for an acting event E, an `alive` fact whose
  `valid_from_event_id == E.id` is applicable at E (same instant
  counts, because the fact is created by E itself). Everything else
  keeps the strict `<`. Applies only to `alive` facts, never `dead`.
  When the exception clears a would-be finding, a run note is recorded
  (`cleared_by: own_event_resurrection`, fact id, event id) so a
  reviewer can see why — the note is not a finding.
- **Item 4b — DEAD_ACTS equal `span_end` ties** (departs from the
  spec SQL). If the top two life-state candidates have equal
  `span_end`, equal `commit_seq` and different `kind`, no winner is
  chosen: the checker emits no `confirmed` `DEAD_ACTS` for any act
  depending on that choice, and instead emits `uncertain` with reason
  `conflicting_life_state_same_point`, citing both fact ids and both
  evidence quotes. If the kinds agree, nothing changes; different
  `commit_seq` keeps the spec rule (higher wins).
- **Item 5 — TWO_PLACES touching intervals** (departs from the literal
  `<=`). Overlap is split by how it arises: positive-length
  intersection, a point event strictly inside the other interval, or
  two point events at the same instant are `confirmed`. A point on an
  endpoint of the other interval, or two real intervals touching at
  exactly one shared endpoint, are `uncertain` with reason
  `touching_interval`. Null bounds and same location still never flag.
- **Item 6 — KNOWLEDGE_LEAK learn-event reality** (departs from the
  literal spec SQL). The knowledge-entry lookup itself is unchanged (a
  current entry still counts as having a belief). But when the only
  candidate learn event is non-asserted or non-real, the checker does
  NOT clear a would-be finding as a clean pass: it emits `uncertain`
  with reason `learned_only_in_non_real_event`, citing the learn event
  and its evidence quote. Knowledge entries carry an in-memory field
  `learned_in_story` (reviewer-settable with evidence — a quote showing
  the character retains or refers to what they learned; SQL and
  extractor schema unchanged): with that mark, the learn event counts
  as normal and the leak is cleared. A real asserted learn event
  before the use behaves as in the spec.

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

## Open questions (M1 → M1.1)

M1 left six questions open; M1.1 (owner-approved 2026-11-23) decided
five of them. The decisions are in "What M1.1 is" above; the M1
readings they replaced are history — the current behavior is the M1.1
one.

1. **LOCATION_TELEPORT — "distant" is undefined.** Still open. The
   spec has no location or distance model, so "distant locations"
   cannot be determined from free-text location strings. The rule is
   implemented with a caller-supplied `isDistant` predicate and yields
   no findings without one.
2. **Promise resolutions — decided in M1.1.** The reviewer picks the
   target from the current projection; no automatic matching.
3. **Explicit records of non-knowledge — decided in M1.1.** New
   ledger entry type `knowledge_denial`, in-memory only.
4. **DEAD_ACTS tie-breaks — decided in M1.1.** Own-event resurrection
   exception (4a); contradictory equal-point ties become `uncertain`
   (4b).
5. **TWO_PLACES touching intervals — decided in M1.1.** A single
   shared endpoint is `uncertain` (`touching_interval`); only
   positive-length overlap, a strictly-inside point, or two point
   events at the same instant are `confirmed`.
6. **KNOWLEDGE_LEAK learn-event reality — decided in M1.1.** A
   non-asserted or non-real learn event yields `uncertain`
   (`learned_only_in_non_real_event`) unless the entry is marked
   `learned_in_story`.

New open questions from M1.1 (not silently decided):

7. **Does a `knowledge_denial`'s stated-at event need to be
   asserted/real?** The proposal does not decide it. M1.1 applies no
   filter to the denial event (literal reading). If the owner later
   requires the denial itself to be asserted and real, the checker
   filter is a one-line change.
8. **Promise resolution in the same batch as the raise.** M1.1
   requires the target promise to already exist in the current
   projection, so a raise and its resolution cannot ride in one batch.
   The proposal deferred the extractor-side fix
   (`target_promise_local_id` in extractor v3).

## How to run

```bash
npm test              # all M0+M1+M1.1 tests, fully offline, zero network calls
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
