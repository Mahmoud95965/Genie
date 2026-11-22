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
import { checkKnowledgeLeak } from "../lib/checker/rules";
import { InMemoryStoryworldRepository } from "../lib/state/memory-store";
import { projectState } from "../lib/state/projections";
import { ValidationFailedError, emptyCommitItems } from "../lib/state/repository";

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

/** Chapter 1 raises a promise (عمر promises ليلى he will return); returns the committed promise id. */
function raisePromise() {
  const repo = new InMemoryStoryworldRepository();
  const { branch } = repo.createProject("Dev story");
  const body1 = "وعد عمر لليلى إنه هيرجع.";
  const { revision: rev1 } = repo.createChapter(branch.id, {
    seq: 1,
    body: body1,
    source: "import",
    expectedHead: null,
  });
  const queue = new ReviewQueue();
  const output1 = emptyOutput();
  output1.events = [
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
  ];
  output1.promises = [
    {
      description: "وعد عمر ليلى إنه هيرجع",
      raised_at_event_local_id: "e1",
      deadline_event_local_id: null,
      deadline_condition: null,
      status_change: "raised",
      resolved_at_event_local_id: null,
      evidence: [{ quote: "وعد عمر لليلى إنه هيرجع", start_offset: 0, end_offset: 23 }],
    },
  ];
  const batch1 = queue.createBatch({ body: body1, output: output1, chapterRevisionId: rev1.id });
  for (const item of batch1.items) queue.accept(batch1.id, item.id);
  const result1 = commitBatch(queue, batch1.id, repo, {
    branchId: branch.id,
    expectedHead: repo.getHead(branch.id),
  });
  const promiseId = result1.committed.promises[0];
  const knownEvents = new Map(result1.mappings.events);
  return { repo, branch, queue, promiseId, knownEvents };
}

/** Chapter 2 resolves the promise with the given status_change; returns the batch and its promise item. */
function resolutionBatch(
  repo: InstanceType<typeof InMemoryStoryworldRepository>,
  branch: { id: string },
  queue: ReviewQueue,
  statusChange: string,
) {
  const body2 = "وفى عمر بوعده.";
  const { revision: rev2 } = repo.createChapter(branch.id, {
    seq: 2,
    body: body2,
    source: "import",
    expectedHead: repo.getHead(branch.id),
  });
  const output2 = emptyOutput();
  output2.events = [
    eventItem({
      local_id: "e2",
      kind: "action",
      summary: "وفى عمر بوعده",
      span_start: 2,
      span_end: 2,
      evidence: [{ quote: "وفى عمر بوعده", start_offset: 0, end_offset: 13 }],
      participants: [{ character: "عمر", role: "actor" }],
    }),
  ];
  output2.promises = [
    {
      description: "وعد عمر ليلى إنه هيرجع",
      raised_at_event_local_id: "e1",
      deadline_event_local_id: null,
      deadline_condition: null,
      status_change: statusChange,
      resolved_at_event_local_id: "e2",
      evidence: [{ quote: "وفى عمر بوعده", start_offset: 0, end_offset: 13 }],
    },
  ];
  const batch = queue.createBatch({ body: body2, output: output2, chapterRevisionId: rev2.id });
  const item = batch.items.find((i) => i.section === "promises");
  if (!item) throw new Error("resolution item missing");
  return { batch, item };
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

  it("M1.1 (2): a resolution without a chosen target cannot be accepted (error names the missing target)", () => {
    const { repo, branch, queue, promiseId } = raisePromise();
    const { batch, item } = resolutionBatch(repo, branch, queue, "fulfilled");
    expect(() => queue.accept(batch.id, item.id)).toThrow(/target promise/);
    const open = projectState(repo.snapshot(branch.id)).promises.map((p) => ({
      id: p.id,
      currentStatus: p.currentStatus,
    }));
    expect(open).toEqual([{ id: promiseId, currentStatus: "open" }]);
    queue.selectPromiseTarget(batch.id, item.id, promiseId, open);
    expect(item.targetPromiseId).toBe(promiseId);
    queue.accept(batch.id, item.id);
    expect(item.status).toBe("accepted");
  });

  it("M1.1 (2): raise then resolve: projection status becomes fulfilled", () => {
    const { repo, branch, queue, promiseId, knownEvents } = raisePromise();
    const { batch, item } = resolutionBatch(repo, branch, queue, "fulfilled");
    const open = projectState(repo.snapshot(branch.id)).promises.map((p) => ({
      id: p.id,
      currentStatus: p.currentStatus,
    }));
    queue.selectPromiseTarget(batch.id, item.id, promiseId, open);
    for (const i of batch.items) if (i.status === "pending") queue.accept(batch.id, i.id);
    const result = commitBatch(queue, batch.id, repo, {
      branchId: branch.id,
      expectedHead: repo.getHead(branch.id),
      knownEvents,
    });
    expect(result.committed.resolutions).toHaveLength(1);
    const state = projectState(repo.snapshot(branch.id));
    expect(state.promises).toHaveLength(1);
    expect(state.promises[0].currentStatus).toBe("fulfilled");
    const stored = repo.snapshot(branch.id).promiseResolutions;
    expect(stored).toHaveLength(1);
    expect(stored[0].promiseId).toBe(promiseId);
    expect(stored[0].status).toBe("fulfilled");
    expect(stored[0].resolvedAtEventId).toBe(result.mappings.events.get("e2"));
  });

  it("M1.1 (2): two resolutions: latest commit wins, both rows remain", () => {
    const { repo, branch, queue, promiseId, knownEvents } = raisePromise();
    const first = resolutionBatch(repo, branch, queue, "fulfilled");
    const open = projectState(repo.snapshot(branch.id)).promises.map((p) => ({
      id: p.id,
      currentStatus: p.currentStatus,
    }));
    queue.selectPromiseTarget(first.batch.id, first.item.id, promiseId, open);
    for (const i of first.batch.items) if (i.status === "pending") queue.accept(first.batch.id, i.id);
    const r1 = commitBatch(queue, first.batch.id, repo, {
      branchId: branch.id,
      expectedHead: repo.getHead(branch.id),
      knownEvents,
    });
    expect(projectState(repo.snapshot(branch.id)).promises[0].currentStatus).toBe("fulfilled");

    // Second resolution (violated) in chapter 3, on the already-resolved promise.
    const body3 = "خلف عمر وعده.";
    const { revision: rev3 } = repo.createChapter(branch.id, {
      seq: 3,
      body: body3,
      source: "import",
      expectedHead: repo.getHead(branch.id),
    });
    const output3 = emptyOutput();
    output3.events = [
      eventItem({
        local_id: "e3",
        kind: "action",
        summary: "خلف عمر وعده",
        span_start: 3,
        span_end: 3,
        evidence: [{ quote: "خلف عمر وعده", start_offset: 0, end_offset: 12 }],
        participants: [{ character: "عمر", role: "actor" }],
      }),
    ];
    output3.promises = [
      {
        description: "وعد عمر ليلى إنه هيرجع",
        raised_at_event_local_id: "e1",
        deadline_event_local_id: null,
        deadline_condition: null,
        status_change: "violated",
        resolved_at_event_local_id: "e3",
        evidence: [{ quote: "خلف عمر وعده", start_offset: 0, end_offset: 12 }],
      },
    ];
    const batch3 = queue.createBatch({ body: body3, output: output3, chapterRevisionId: rev3.id });
    const item3 = batch3.items.find((i) => i.section === "promises");
    if (!item3) throw new Error("resolution item missing");
    const current = projectState(repo.snapshot(branch.id)).promises.map((p) => ({
      id: p.id,
      currentStatus: p.currentStatus,
    }));
    expect(current[0].currentStatus).toBe("fulfilled");
    queue.selectPromiseTarget(batch3.id, item3.id, promiseId, current);
    expect(item3.resolutionConflict).toEqual({
      targetPromiseId: promiseId,
      previousStatus: "fulfilled",
    });
    expect(() => queue.accept(batch3.id, item3.id)).toThrow(/confirm the resolution conflict/);
    queue.confirmResolutionConflict(batch3.id, item3.id);
    for (const i of batch3.items) if (i.status === "pending") queue.accept(batch3.id, i.id);
    const knownEvents2 = new Map([...knownEvents, ...r1.mappings.events]);
    commitBatch(queue, batch3.id, repo, {
      branchId: branch.id,
      expectedHead: repo.getHead(branch.id),
      knownEvents: knownEvents2,
    });
    const state = projectState(repo.snapshot(branch.id));
    expect(state.promises[0].currentStatus).toBe("violated");
    expect(repo.snapshot(branch.id).promiseResolutions).toHaveLength(2);
  });

  it("M1.1 (2): retracting a resolution returns the status to open", () => {
    const { repo, branch, queue, promiseId, knownEvents } = raisePromise();
    const { batch, item } = resolutionBatch(repo, branch, queue, "fulfilled");
    const open = projectState(repo.snapshot(branch.id)).promises.map((p) => ({
      id: p.id,
      currentStatus: p.currentStatus,
    }));
    queue.selectPromiseTarget(batch.id, item.id, promiseId, open);
    for (const i of batch.items) if (i.status === "pending") queue.accept(batch.id, i.id);
    commitBatch(queue, batch.id, repo, {
      branchId: branch.id,
      expectedHead: repo.getHead(branch.id),
      knownEvents,
    });
    expect(projectState(repo.snapshot(branch.id)).promises[0].currentStatus).toBe("fulfilled");
    const resolutionId = repo.snapshot(branch.id).promiseResolutions[0].id;
    repo.commit({
      branchId: branch.id,
      expectedHead: repo.getHead(branch.id),
      items: emptyCommitItems(),
      retracts: [{ entryTable: "promise_resolution", entryId: resolutionId, reason: "wrong resolution" }],
    });
    expect(projectState(repo.snapshot(branch.id)).promises[0].currentStatus).toBe("open");
    // The resolution row is still in the ledger (append-only).
    expect(repo.snapshot(branch.id).promiseResolutions).toHaveLength(1);
  });

  it("M1.1 (2): a resolution without resolved_at_event_local_id is rejected at commit", () => {
    const { repo, branch, queue, promiseId } = raisePromise();
    const body2 = "وفى عمر بوعده.";
    const { revision: rev2 } = repo.createChapter(branch.id, {
      seq: 2,
      body: body2,
      source: "import",
      expectedHead: repo.getHead(branch.id),
    });
    const output2 = emptyOutput();
    output2.events = [
      eventItem({
        local_id: "e2",
        kind: "action",
        summary: "وفى عمر بوعده",
        span_start: 2,
        span_end: 2,
        evidence: [{ quote: "وفى عمر بوعده", start_offset: 0, end_offset: 13 }],
        participants: [{ character: "عمر", role: "actor" }],
      }),
    ];
    output2.promises = [
      {
        description: "وعد عمر ليلى إنه هيرجع",
        raised_at_event_local_id: "e1",
        deadline_event_local_id: null,
        deadline_condition: null,
        status_change: "fulfilled",
        resolved_at_event_local_id: null,
        evidence: [{ quote: "وفى عمر بوعده", start_offset: 0, end_offset: 13 }],
      },
    ];
    const batch2 = queue.createBatch({ body: body2, output: output2, chapterRevisionId: rev2.id });
    const item = batch2.items.find((i) => i.section === "promises");
    if (!item) throw new Error("resolution item missing");
    const open = projectState(repo.snapshot(branch.id)).promises.map((p) => ({
      id: p.id,
      currentStatus: p.currentStatus,
    }));
    queue.selectPromiseTarget(batch2.id, item.id, promiseId, open);
    for (const i of batch2.items) if (i.status === "pending") queue.accept(batch2.id, i.id);
    expect(() =>
      commitBatch(queue, batch2.id, repo, {
        branchId: branch.id,
        expectedHead: repo.getHead(branch.id),
      }),
    ).toThrow(ValidationFailedError);
    expect(repo.listCommits(branch.id)).toHaveLength(3); // ch1 creation, raise, ch2 creation; the failed commit added none
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

describe("review queue: knowledge denials (M1.1 item 3)", () => {
  const DENIAL_BODY =
    "الرسايل مخبأة في المنارة. قال كريم: لا أعرف أين الرسايل. فكر كريم في الرسايل المخبأة.";
  const DENIAL_QUOTE = "قال كريم: لا أعرف أين الرسايل";

  /** One chapter: proposition p1, a denial event at t2, a use event at t6. */
  function denialSetup() {
    const repo = new InMemoryStoryworldRepository();
    const { branch } = repo.createProject("Dev story");
    const { revision } = repo.createChapter(branch.id, {
      seq: 1,
      body: DENIAL_BODY,
      source: "import",
      expectedHead: null,
    });
    const queue = new ReviewQueue();
    const output = emptyOutput();
    output.propositions = [
      {
        local_id: "p1",
        statement: "الرسايل مخبأة في المنارة",
        evidence: [{ quote: "الرسايل مخبأة في المنارة", start_offset: 0, end_offset: 24 }],
      },
    ];
    output.events = [
      eventItem({
        local_id: "e-deny",
        kind: "observation",
        summary: "قال كريم: لا أعرف أين الرسايل",
        span_start: 2,
        span_end: 2,
        evidence: [{ quote: DENIAL_QUOTE, start_offset: 26, end_offset: 55 }],
        participants: [{ character: "كريم", role: "speaker" }],
      }),
      eventItem({
        local_id: "e-use",
        kind: "knowledge_use",
        summary: "فكر كريم في الرسايل",
        span_start: 6,
        span_end: 6,
        evidence: [{ quote: "فكر كريم في الرسايل المخبأة", start_offset: 57, end_offset: 84 }],
        participants: [{ character: "كريم", role: "subject" }],
        knowledge_use: { character: "كريم", proposition_local_id: "p1" },
      }),
    ];
    const batch = queue.createBatch({ body: DENIAL_BODY, output, chapterRevisionId: revision.id });
    return { repo, branch, queue, batch };
  }

  function addDenial(queue: ReviewQueue, batchId: string) {
    return queue.addKnowledgeDenial(batchId, {
      character: "كريم",
      propositionLocalId: "p1",
      statedAtEventLocalId: "e-deny",
      evidence: [{ quote: DENIAL_QUOTE, startOffset: 26, endOffset: 55 }],
    });
  }

  it("a denial goes through the review queue and confirms a leak", () => {
    const { repo, branch, queue, batch } = denialSetup();
    const denialItem = addDenial(queue, batch.id);
    expect(denialItem.status).toBe("pending");
    expect(denialItem.verificationError).toBeNull();
    expect(denialItem.evidence[0].startOffset).toBe(26);
    expect(denialItem.evidence[0].endOffset).toBe(55);
    for (const item of batch.items) queue.accept(batch.id, item.id);
    const result = commitBatch(queue, batch.id, repo, {
      branchId: branch.id,
      expectedHead: repo.getHead(branch.id),
    });
    expect(result.committed.knowledgeDenials).toHaveLength(1);
    const state = projectState(repo.snapshot(branch.id));
    expect(state.knowledgeDenials).toHaveLength(1);
    expect(state.knowledgeDenials[0].statedAtEventId).toBe(result.mappings.events.get("e-deny"));
    const findings = checkKnowledgeLeak(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("confirmed");
  });

  it("a denial without evidence cannot be accepted", () => {
    const { queue, batch } = denialSetup();
    const item = queue.addKnowledgeDenial(batch.id, {
      character: "كريم",
      propositionLocalId: "p1",
      statedAtEventLocalId: "e-deny",
      evidence: [{ quote: "جملة غير موجودة", startOffset: 0, endOffset: 14 }],
    });
    expect(item.verificationError).toMatch(/quote_not_found/);
    expect(() => queue.accept(batch.id, item.id)).toThrow(ReviewError);
  });

  it("retracting a denial removes its confirmation", () => {
    const { repo, branch, queue, batch } = denialSetup();
    addDenial(queue, batch.id);
    for (const item of batch.items) queue.accept(batch.id, item.id);
    const result = commitBatch(queue, batch.id, repo, {
      branchId: branch.id,
      expectedHead: repo.getHead(branch.id),
    });
    const denialId = result.committed.knowledgeDenials[0];
    repo.commit({
      branchId: branch.id,
      expectedHead: repo.getHead(branch.id),
      items: emptyCommitItems(),
      retracts: [{ entryTable: "knowledge_denial", entryId: denialId, reason: "misread the sentence" }],
    });
    const state = projectState(repo.snapshot(branch.id));
    expect(state.knowledgeDenials).toHaveLength(0);
    const findings = checkKnowledgeLeak(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("uncertain");
    expect(findings[0].reason).toBe("open_world");
  });
});
