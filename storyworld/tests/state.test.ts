/**
 * Repository / commit-protocol tests (M1) — spec sections 2, 3 and 9.
 *
 * In-memory store only. Verifies the optimistic head check, atomicity
 * (a failed commit inserts nothing), idempotency, append-only retractions,
 * scope enforcement, and chapter/revision handling.
 */
import { describe, expect, it } from "vitest";

import { InMemoryStoryworldRepository } from "../lib/state/memory-store";
import { projectState } from "../lib/state/projections";
import {
  BranchingDisabledError,
  HeadConflictError,
  ScopeViolationError,
  ValidationFailedError,
  emptyCommitItems,
} from "../lib/state/repository";
import type { CommitItems } from "../lib/state/repository";

const SPAN = {
  quote: "مات القبطان سالم",
  startOffset: 16,
  endOffset: 32,
  chapterRevisionId: "rev-1",
  bodySha256: "sha",
};

function setup() {
  const repo = new InMemoryStoryworldRepository();
  const { project, branch } = repo.createProject("Dev story");
  const { revision } = repo.createChapter(branch.id, {
    seq: 1,
    title: "Chapter 1",
    body: "في ليلة العاصفة مات القبطان سالم.",
    source: "import",
    expectedHead: null,
  });
  // The revision id is real; evidence spans must cite it.
  const span = { ...SPAN, chapterRevisionId: revision.id };
  return { repo, project, branch, revision, span };
}

function deathEvent(revisionId: string, span: typeof SPAN): CommitItems {
  return {
    ...emptyCommitItems(),
    events: [
      {
        id: "evt-death",
        chapterRevisionId: revisionId,
        kind: "death",
        summary: "مات القبطان سالم",
        location: null,
        storyTime: "ليلة العاصفة",
        spanStart: 1,
        spanEnd: 1,
        realityScope: "real",
        certainty: "asserted",
        participants: [],
        evidence: [span],
      },
    ],
  };
}

describe("repository: projects and branches", () => {
  it("createProject creates a main branch with a null head", () => {
    const repo = new InMemoryStoryworldRepository();
    const { project, branch } = repo.createProject("Story");
    expect(branch.name).toBe("main");
    expect(branch.projectId).toBe(project.id);
    expect(repo.getHead(branch.id)).toBeNull();
    expect(repo.listCommits(branch.id)).toHaveLength(0);
  });

  it("createBranch throws BRANCHING_DISABLED in M1", () => {
    const repo = new InMemoryStoryworldRepository();
    const { project } = repo.createProject("Story");
    expect(() => repo.createBranch(project.id, "alt")).toThrow(BranchingDisabledError);
  });
});

describe("repository: commit protocol", () => {
  it("commits insert rows, assign commit_seq, and move the head", () => {
    const { repo, branch, revision, span } = setup();
    const headBefore = repo.getHead(branch.id);
    const result = repo.commit({
      branchId: branch.id,
      expectedHead: headBefore,
      items: deathEvent(revision.id, span),
    });
    expect(result.commit.commitSeq).toBe(2); // 1 = chapter creation
    expect(result.commit.parentCommitId).toBe(headBefore);
    expect(repo.getHead(branch.id)).toBe(result.commit.id);
    expect(result.inserted.events).toHaveLength(1);
    expect(repo.listCommits(branch.id)).toHaveLength(2);
  });

  it("a stale expectedHead throws HEAD_CONFLICT and inserts nothing", () => {
    const { repo, branch, revision, span } = setup();
    const head = repo.getHead(branch.id);
    repo.commit({ branchId: branch.id, expectedHead: head, items: deathEvent(revision.id, span) });
    expect(() =>
      repo.commit({ branchId: branch.id, expectedHead: head, items: deathEvent(revision.id, span) }),
    ).toThrow(HeadConflictError);
    expect(repo.listCommits(branch.id)).toHaveLength(2);
    expect(repo.snapshot(branch.id).events).toHaveLength(1);
  });

  it("a repeated idempotency key returns the original commit without re-inserting", () => {
    const { repo, branch, revision, span } = setup();
    const first = repo.commit({
      branchId: branch.id,
      expectedHead: repo.getHead(branch.id),
      idempotencyKey: "commit-1",
      items: deathEvent(revision.id, span),
    });
    const second = repo.commit({
      branchId: branch.id,
      expectedHead: repo.getHead(branch.id),
      idempotencyKey: "commit-1",
      items: deathEvent(revision.id, span),
    });
    expect(second.commit.id).toBe(first.commit.id);
    expect(repo.listCommits(branch.id)).toHaveLength(2);
    expect(repo.snapshot(branch.id).events).toHaveLength(1);
  });

  it("a failed commit is atomic: nothing is inserted, head does not move", () => {
    const { repo, branch, revision, span } = setup();
    const head = repo.getHead(branch.id);
    const bad = deathEvent(revision.id, span);
    bad.events[0].participants.push({ characterId: "char-ghost", role: "victim" });
    expect(() =>
      repo.commit({ branchId: branch.id, expectedHead: head, items: bad }),
    ).toThrow(ScopeViolationError);
    expect(repo.getHead(branch.id)).toBe(head);
    expect(repo.snapshot(branch.id).events).toHaveLength(0);
    expect(repo.listCommits(branch.id)).toHaveLength(1);
  });

  it("an event citing an unknown chapter revision fails validation", () => {
    const { repo, branch, span } = setup();
    expect(() =>
      repo.commit({
        branchId: branch.id,
        expectedHead: repo.getHead(branch.id),
        items: deathEvent("rev-nope", span),
      }),
    ).toThrow(ValidationFailedError);
    expect(repo.snapshot(branch.id).events).toHaveLength(0);
  });

  it("an item without evidence fails validation", () => {
    const { repo, branch, revision } = setup();
    const items = deathEvent(revision.id, {
      quote: "x",
      startOffset: 0,
      endOffset: 1,
      chapterRevisionId: revision.id,
      bodySha256: "sha",
    });
    items.events[0].evidence = [];
    expect(() =>
      repo.commit({ branchId: branch.id, expectedHead: repo.getHead(branch.id), items }),
    ).toThrow(ValidationFailedError);
  });
});

describe("repository: M1.1 learned_in_story mark (item 6)", () => {
  it("marks a knowledge entry with evidence; empty evidence and unknown ids fail", () => {
    const { repo, branch, revision, span } = setup();
    const character = repo.getOrCreateCharacter(branch.projectId, "كريم");
    const committed = repo.commit({
      branchId: branch.id,
      expectedHead: repo.getHead(branch.id),
      items: {
        ...emptyCommitItems(),
        propositions: [{ id: "prop-1", statement: "الرسايل مخبأة", evidence: [span] }],
        events: [
          {
            id: "evt-learn",
            chapterRevisionId: revision.id,
            kind: "knowledge_transfer",
            summary: "حلم كريم",
            location: null,
            storyTime: null,
            spanStart: 3,
            spanEnd: 3,
            realityScope: "dream",
            certainty: "asserted",
            participants: [{ characterId: character.id, role: "listener" }],
            evidence: [span],
          },
        ],
        knowledge: [
          {
            id: "k-1",
            characterId: character.id,
            propositionId: "prop-1",
            learnedAtEventId: "evt-learn",
            learnedHow: "told",
            certainty: "asserted",
            evidence: [span],
          },
        ],
      },
    });
    const knowledgeId = committed.inserted.knowledge[0].id;
    expect(committed.inserted.knowledge[0].learnedInStory).toBe(false);
    const markSpan = { ...span, quote: "تذكر كريم الحلم" };
    const marked = repo.markKnowledgeLearnedInStory(knowledgeId, [markSpan]);
    expect(marked.learnedInStory).toBe(true);
    expect(marked.learnedInStoryEvidence).toHaveLength(1);
    // The mark is annotation, not a new commit: the head did not move.
    expect(repo.getHead(branch.id)).toBe(committed.commit.id);
    expect(() => repo.markKnowledgeLearnedInStory(knowledgeId, [])).toThrow(ValidationFailedError);
    expect(() => repo.markKnowledgeLearnedInStory("no-such-id", [markSpan])).toThrow(
      /Unknown knowledge entry/,
    );
  });
});

describe("repository: retractions and chapters", () => {
  it("a retraction removes the entry from projections but not from the ledger", () => {
    const { repo, branch, revision, span } = setup();
    const committed = repo.commit({
      branchId: branch.id,
      expectedHead: repo.getHead(branch.id),
      items: deathEvent(revision.id, span),
    });
    const eventId = committed.inserted.events[0].id;
    repo.commit({
      branchId: branch.id,
      expectedHead: repo.getHead(branch.id),
      items: emptyCommitItems(),
      retracts: [{ entryTable: "event", entryId: eventId, reason: "wrong extraction" }],
    });
    const snapshot = repo.snapshot(branch.id);
    expect(snapshot.events).toHaveLength(1); // ledger row still there
    expect(projectState(snapshot).events).toHaveLength(0); // projection filters it
    expect(snapshot.retractions).toHaveLength(1);
  });

  it("retracting an already-retracted entry fails validation", () => {
    const { repo, branch, revision, span } = setup();
    const committed = repo.commit({
      branchId: branch.id,
      expectedHead: repo.getHead(branch.id),
      items: deathEvent(revision.id, span),
    });
    const eventId = committed.inserted.events[0].id;
    const retract = {
      branchId: branch.id,
      expectedHead: repo.getHead(branch.id),
      items: emptyCommitItems(),
      retracts: [{ entryTable: "event" as const, entryId: eventId, reason: "wrong extraction" }],
    };
    repo.commit(retract);
    expect(() =>
      repo.commit({ ...retract, expectedHead: repo.getHead(branch.id) }),
    ).toThrow(ValidationFailedError);
  });

  it("chapter seq reuse throws; revisions increment and move the active head", () => {
    const { repo, branch } = setup();
    expect(() =>
      repo.createChapter(branch.id, {
        seq: 1,
        body: "again",
        source: "import",
        expectedHead: repo.getHead(branch.id),
      }),
    ).toThrow(/already used/);
    const chapters = repo.listChapters(branch.id);
    expect(chapters).toHaveLength(1);
    const { revision } = repo.createChapterRevision(branch.id, chapters[0].id, {
      body: "في ليلة العاصفة مات القبطان سالم. وقف عمر.",
      source: "human",
      expectedHead: repo.getHead(branch.id),
    });
    expect(revision.revisionNo).toBe(2);
    expect(repo.getActiveRevision(chapters[0].id, branch.id)?.id).toBe(revision.id);
  });

  it("snapshot(upToCommitSeq) sees state as of that commit only", () => {
    const { repo, branch, revision, span } = setup();
    repo.commit({
      branchId: branch.id,
      expectedHead: repo.getHead(branch.id),
      items: deathEvent(revision.id, span),
    });
    // commit_seq 1 = chapter creation, 2 = the death event.
    expect(repo.snapshot(branch.id, 1).events).toHaveLength(0);
    expect(repo.snapshot(branch.id, 2).events).toHaveLength(1);
  });
});
