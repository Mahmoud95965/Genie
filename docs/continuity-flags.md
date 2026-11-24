# Reviewer-assisted continuity flags (offline plumbing)

These flags help a HUMAN reviewer carry context across chapters. They do not close the gaps below automatically.

## Extraction: `run-live-extraction`
- `--store <path>`: read the durable store snapshot; events already COMMITTED (accepted by a reviewer) are listed with their
  story-order intervals in the extractor message ("Earlier committed events..."). No store or empty store: message unchanged.
  Whether a model reuses those numbers is unmeasured.
- Default extractor profile is still `extractor.v3`. The measured modality path is `extractor.v4`: pass `--extractor extractor.v4`
  explicitly (`--live` also needs the usual prerequisites and approved attempt id). Nothing here changes the default.

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
