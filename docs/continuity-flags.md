# Reviewer-assisted continuity flags (offline plumbing)

These flags help a HUMAN reviewer carry context across chapters. They do not close the gaps below automatically.

## Extraction: `run-live-extraction`
- `--store <path>`: read the durable store snapshot; events already COMMITTED (accepted by a reviewer) are listed with their
  story-order intervals in the extractor message ("Earlier committed events..."). No store or empty store: message unchanged.
  Whether a model reuses those numbers is unmeasured.
- Default extractor profile is still `extractor.v3`. The measured modality path is `extractor.v4`: pass `--extractor extractor.v4`
  explicitly (`--live` also needs the usual prerequisites and approved attempt id). Nothing here changes the default.

- `--cast <json>`: JSON array of canonical character names (non-empty, unique, reserved names rejected). It fills the extractor
  message's "Canonical cast" line, which was always empty before, so models stop writing the same person under translated or
  spelled-out variants. Names only; it adds no facts and does not merge aliases (use `--aliases` for that). Give the same cast to
  any baseline you compare against.
- `--extractor extractor.v4.1` (OPT-IN candidate, never the default): v4 plus a numbering rule for events narrated out of order:
  before = ends strictly below the listed event's start, same time = overlap (only when the text says so), after = starts strictly
  above its end, order not stated = null. UNMEASURED: nothing here shows a model follows it. Limits: numbers are whole numbers
  (negatives allowed), so ties happen. The checker needs death end < act start, so an EQUAL number is an unresolved tie (not flagged,
  and not evidence of "before"), and a null span is skipped by DEAD_ACTS, so a real post-death action with unknown order is not caught.
- Saved review artifacts: the modality requirement is read from the artifact's extractor version. A known version answers from its
  profile; a MISSING version (legacy artifact) keeps the old behaviour (no modality requirement); an explicit UNKNOWN version fails with
  ARTIFACT_INVALID instead of being silently treated as modality-free.

## Review: `review-accept`
- `--aliases <json>`: explicit map `{"alias": "canonical name"}`. Exact match only, never guessed. Reserved keys (`__proto__`,
  `constructor`, `prototype`), empty strings, non-string values and alias chains are rejected. Use the same canonical names across chapters.
  Without it, characters merge by exact name only, so an alias hides contradictions.

## Known limits (not fixed here)
- A deadline event that first appears in a LATER chapter cannot be linked from the promise's chapter: commit fails with "unknown deadline event".
- A promise fulfilled later stays open (and can be flagged PROMISE_OVERDUE) unless the reviewer chooses the target promise (`targetPromiseId`
  in the decisions file). There is no automatic matching and no auto-accept path.
- TWO_PLACES across chapters needs the extractor to reuse the same interval numbers; unproven.
- Tests use hand-written extractions: they show plumbing, not model quality.
