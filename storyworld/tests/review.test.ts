/**
 * Review queue tests (M1) — spec sections 4, 6.5 and 9.
 *
 * Candidates become pending items; only evidence-verified items can be
 * accepted; ambiguous quotes need an explicit choice of occurrence;
 * rejected items are kept with a reason; a commit groups the accepted
 * items.
 */
import { describe, expect, it } from "vitest";

import { loadFixture } from "../lib/jobs/worker";
import { ReviewError, ReviewQueue } from "../lib/review/queue";
import { commitBatch } from "../lib/review/commit";
import { InMemoryStoryworldRepository } from "../lib/state/memory-store";
import { projectState } from "../lib/state/projections";
import { ValidationFailedError } from "../lib/state/repository";

function emptyOutput(): Record<string, unknown> {
  return { propositions: [], events: [], knowledge: [], character_facts: [], promises: [] };
}

function eventItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    local_id: "e1",
    kind: "action",
    summary: "فعل",
    participants: [],
    location: null,
    story_time: null,
    span_start: 1,
    span_end: 1,
    reality_scope: "real",
    certainty: "asserted",
    evidence: [{ quote: "قال سالم", start_offset: 0, end_offset: 8 }],
    knowledge_transfer: null,
    knowledge_use: null,
    ...overrides,
  };
}

describe("review queue: batch creation", () => {
  it("turns fixture chapter 1 into 3 verified pending items", () => {
    const queue = new ReviewQueue();
    const fixture = loadFixture("dev-short-story-v1");
    const chapter = fixture.chapters.find((c) => c.seq === 1);
    if (!chapter) throw new Error("fixture chapter 1 missing");
    const batch = queue.createBatch({ body: chapter.body, output: chapter.expected_extraction });
    expect(batch.items).toHaveLength(3);
    expect(batch.items.map((i) => i.section).sort()).toEqual([
      "character_facts",
      "events",
      "events",
    ]);
    for (const item of batch.items) {
      expect(item.status).toBe("pending");
      expect(item.verificationError).toBeNull();
    }
    // Canonical offsets come from the verifier, not the model.
    const e1 = batch.items.find((i) => i.localId === "e1");
    expect(e1?.evidence[0].startOffset).toBe(16);
    expect(e1?.evidence[0].endOffset).toBe(32);
    expect(e1?.evidence[0].ambiguous).toBe(false);
  });

  it("rejects an invalid extraction at batch creation", () => {
    const queue = new ReviewQueue();
    const output = emptyOutput();
    output.events = [{ local_id: "e1" }]; // missing required keys
    expect(() => queue.createBatch({ body: "نص", output })).toThrow(ReviewError);
  });

  it("flags an unverified item and blocks acceptance but allows rejection", () => {
    const queue = new ReviewQueue();
    const output = emptyOutput();
    output.events = [
      eventItem({ evidence: [{ quote: "جملة غير موجودة", start_offset: 0, end_offset: 14 }] }),
    ];
    const batch = queue.createBatch({ body: "قال سالم.", output });
    const item = batch.items[0];
    expect(item.verificationError).toMatch(/quote_not_found/);
    expect(() => queue.accept(batch.id, item.id)).toThrow(ReviewError);
    queue.reject(batch.id, item.id, "quote is not in the chapter");
    expect(item.status).toBe("rejected");
    expect(item.rejectReason).toBe("quote is not in the chapter");
  });

  it("an ambiguous quote needs an explicit choice of occurrence", () => {
    const queue = new ReviewQueue();
    const body = "قال سالم: أهلا. قال سالم: وداعا.";
    const output = emptyOutput();
    output.events = [eventItem({ evidence: [{ quote: "قال سالم", start_offset: 0, end_offset: 8 }] })];
    const batch = queue.createBatch({ body, output });
    const item = batch.items[0];
    expect(item.verificationError).toBeNull();
    expect(item.evidence[0].ambiguous).toBe(true);
    expect(item.evidence[0].occurrences).toHaveLength(2);
    expect(() => queue.accept(batch.id, item.id)).toThrow(ReviewError);
    expect(() => queue.resolveAmbiguity(batch.id, item.id, 0, 5)).toThrow(ReviewError);
    queue.resolveAmbiguity(batch.id, item.id, 0, 1);
    expect(item.evidence[0].chosenOccurrence).toEqual(item.evidence[0].occurrences[1]);
    expect(item.evidence[0].startOffset).toBe(item.evidence[0].occurrences[1][0]);
    queue.accept(batch.id, item.id);
    expect(item.status).toBe("accepted");
  });

  it("accepting twice throws ALREADY_DECIDED", () => {
    const queue = new ReviewQueue();
    const fixture = loadFixture("dev-short-story-v1");
    const chapter = fixture.chapters.find((c) => c.seq === 1);
    if (!chapter) throw new Error("fixture chapter 1 missing");
    const batch = queue.createBatch({ body: chapter.body, output: chapter.expected_extraction });
    const item = batch.items[0];
    queue.accept(batch.id, item.id);
    expect(() => queue.accept(batch.id, item.id)).toThrow(ReviewError);
  });
});

describe("review queue: commit", () => {
  it("commits accepted chapter-1 items; mappings resolve local ids", () => {
    const repo = new InMemoryStoryworldRepository();
    const { branch } = repo.createProject("Dev story");
    const fixture = loadFixture("dev-short-story-v1");
    const chapter = fixture.chapters.find((c) => c.seq === 1);
    if (!chapter) throw new Error("fixture chapter 1 missing");
    const { revision } = repo.createChapter(branch.id, {
      seq: 1,
      body: chapter.body,
      source: "import",
      expectedHead: null,
    });
    const queue = new ReviewQueue();
    const batch = queue.createBatch({
      body: chapter.body,
      output: chapter.expected_extraction,
      chapterRevisionId: revision.id,
      fixtureId: fixture.fixture_id,
      chapterSeq: 1,
    });
    for (const item of batch.items) queue.accept(batch.id, item.id);
    const result = commitBatch(queue, batch.id, repo, {
      branchId: branch.id,
      expectedHead: repo.getHead(branch.id),
    });
    expect(result.commit.commitSeq).toBe(2); // 1 = chapter creation
    expect(result.mappings.events.get("e1")).toBeTruthy();
    expect(result.mappings.events.get("e2")).toBeTruthy();
    const state = projectState(repo.snapshot(branch.id));
    expect(state.events).toHaveLength(2);
    expect(state.characterFacts).toHaveLength(1);
    expect(state.characterFacts[0].kind).toBe("dead");
    expect(repo.listCharacters(branch.projectId).map((c) => c.canonicalName).sort()).toEqual([
      "سالم",
      "عمر",
      "ليلى",
    ]);
  });

  it("rejected items are kept with a reason and excluded from the commit", () => {
    const repo = new InMemoryStoryworldRepository();
    const { branch } = repo.createProject("Dev story");
    const fixture = loadFixture("dev-short-story-v1");
    const chapter = fixture.chapters.find((c) => c.seq === 1);
    if (!chapter) throw new Error("fixture chapter 1 missing");
    const { revision } = repo.createChapter(branch.id, {
      seq: 1,
      body: chapter.body,
      source: "import",
      expectedHead: null,
    });
    const queue = new ReviewQueue();
    const batch = queue.createBatch({
      body: chapter.body,
      output: chapter.expected_extraction,
      chapterRevisionId: revision.id,
    });
    const factItem = batch.items.find((i) => i.section === "character_facts");
    if (!factItem) throw new Error("fact item missing");
    queue.reject(batch.id, factItem.id, "death is a metaphor here, not a fact");
    for (const item of batch.items.filter((i) => i.status === "pending")) {
      queue.accept(batch.id, item.id);
    }
    const result = commitBatch(queue, batch.id, repo, {
      branchId: branch.id,
      expectedHead: repo.getHead(branch.id),
    });
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe("death is a metaphor here, not a fact");
    const state = projectState(repo.snapshot(branch.id));
    expect(state.events).toHaveLength(2);
    expect(state.characterFacts).toHaveLength(0);
  });

  it("a promise with status_change != raised fails commit validation (open question)", () => {
    const repo = new InMemoryStoryworldRepository();
    const { branch } = repo.createProject("Dev story");
    const body = "وعد عمر لليلى إنه هيرجع. وفى عمر بوعده.";
    const { revision } = repo.createChapter(branch.id, {
      seq: 1,
      body,
      source: "import",
      expectedHead: null,
    });
    const queue = new ReviewQueue();
    const output = emptyOutput();
    output.events = [
      eventItem({
        local_id: "e1",
        kind: "promise_raised",
        summary: "وعد عمر ليلى",
        evidence: [{ quote: "وعد عمر لليلى إنه هيرجع", start_offset: 0, end_offset: 23 }],
        participants: [
          { character: "عمر", role: "actor" },
          { character: "ليلى", role: "listener" },
        ],
      }),
      eventItem({
        local_id: "e2",
        kind: "action",
        summary: "وفى عمر بوعده",
        span_start: 2,
        span_end: 2,
        evidence: [{ quote: "وفى عمر بوعده", start_offset: 25, end_offset: 38 }],
        participants: [{ character: "عمر", role: "actor" }],
      }),
    ];
    output.promises = [
      {
        description: "وعد عمر ليلى إنه هيرجع",
        raised_at_event_local_id: "e1",
        deadline_event_local_id: null,
        deadline_condition: null,
        status_change: "fulfilled",
        resolved_at_event_local_id: "e2",
        evidence: [{ quote: "وفى عمر بوعده", start_offset: 25, end_offset: 38 }],
      },
    ];
    const batch = queue.createBatch({ body, output, chapterRevisionId: revision.id });
    for (const item of batch.items) queue.accept(batch.id, item.id);
    expect(() =>
      commitBatch(queue, batch.id, repo, {
        branchId: branch.id,
        expectedHead: repo.getHead(branch.id),
      }),
    ).toThrow(ValidationFailedError);
    // Nothing was committed: only the chapter-creation commit exists.
    expect(repo.listCommits(branch.id)).toHaveLength(1);
  });

  it("a knowledge_use referencing an unknown proposition fails validation", () => {
    const repo = new InMemoryStoryworldRepository();
    const { branch } = repo.createProject("Dev story");
    const body = "فكر كريم في الرسايل المخبأة.";
    const { revision } = repo.createChapter(branch.id, {
      seq: 1,
      body,
      source: "import",
      expectedHead: null,
    });
    const queue = new ReviewQueue();
    const output = emptyOutput();
    output.events = [
      eventItem({
        local_id: "e1",
        kind: "knowledge_use",
        summary: "فكر كريم في الرسايل",
        evidence: [{ quote: "فكر كريم في الرسايل المخبأة", start_offset: 0, end_offset: 27 }],
        participants: [{ character: "كريم", role: "subject" }],
        knowledge_use: { character: "كريم", proposition_local_id: "p-missing" },
      }),
    ];
    const batch = queue.createBatch({ body, output, chapterRevisionId: revision.id });
    for (const item of batch.items) queue.accept(batch.id, item.id);
    expect(() =>
      commitBatch(queue, batch.id, repo, {
        branchId: branch.id,
        expectedHead: repo.getHead(branch.id),
      }),
    ).toThrow(ValidationFailedError);
  });
});
