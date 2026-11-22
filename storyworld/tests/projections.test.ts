/**
 * Projection tests (M1) — spec section 2.
 *
 * Pure functions over synthetic snapshots: retracted entries are
 * filtered, promise status comes from the latest resolution (default
 * open), and participants/uses follow their event's currency.
 */
import { describe, expect, it } from "vitest";

import { projectState } from "../lib/state/projections";
import { CHAR, ev, fact, know, makeState, part, promise, proposition, resolution, use } from "./helpers";

describe("projections", () => {
  it("retracted entries are excluded from the projection, not the snapshot", () => {
    const state = makeState({
      events: [ev({ id: "e-1", summary: "حدث", spanStart: 1, spanEnd: 1 })],
      participants: [part("e-1", CHAR.omar, "actor")],
      facts: [fact({ id: "f-1", validFromEventId: "e-1" })],
      retractions: [
        {
          id: "r-1",
          branchId: "branch-1",
          commitId: "commit-1",
          entryTable: "event",
          entryId: "e-1",
          reason: "wrong extraction",
        },
      ],
    });
    expect(state.events).toHaveLength(0);
    expect(state.participants).toHaveLength(0);
    // The fact row itself is not retracted; its event is gone.
    expect(state.characterFacts).toHaveLength(1);
  });

  it("a retracted fact, knowledge entry, and proposition are excluded", () => {
    const state = makeState({
      events: [ev({ id: "e-1", summary: "حدث", spanStart: 1, spanEnd: 1 })],
      facts: [fact({ id: "f-1", validFromEventId: "e-1" })],
      knowledge: [know({ id: "k-1", learnedAtEventId: "e-1" })],
      propositions: [proposition({ id: "prop-1", statement: "الرسايل مخبأة" })],
      retractions: [
        {
          id: "r-1",
          branchId: "branch-1",
          commitId: "commit-1",
          entryTable: "character_fact",
          entryId: "f-1",
          reason: "superseded",
        },
        {
          id: "r-2",
          branchId: "branch-1",
          commitId: "commit-1",
          entryTable: "knowledge",
          entryId: "k-1",
          reason: "superseded",
        },
        {
          id: "r-3",
          branchId: "branch-1",
          commitId: "commit-1",
          entryTable: "proposition",
          entryId: "prop-1",
          reason: "superseded",
        },
      ],
    });
    expect(state.characterFacts).toHaveLength(0);
    expect(state.knowledge).toHaveLength(0);
    expect(state.propositions).toHaveLength(0);
  });

  it("promise status defaults to open", () => {
    const state = makeState({
      promises: [promise({ id: "promise-1" })],
    });
    expect(state.promises).toHaveLength(1);
    expect(state.promises[0].currentStatus).toBe("open");
  });

  it("promise status comes from the latest resolution by commit_seq", () => {
    const commits = [
      {
        id: "commit-1",
        branchId: "branch-1",
        commitSeq: 1,
        parentCommitId: null,
        author: "human",
        idempotencyKey: null,
        createdAt: "2026-11-22T00:00:00.000Z",
      },
      {
        id: "commit-2",
        branchId: "branch-1",
        commitSeq: 2,
        parentCommitId: "commit-1",
        author: "human",
        idempotencyKey: null,
        createdAt: "2026-11-22T00:01:00.000Z",
      },
      {
        id: "commit-3",
        branchId: "branch-1",
        commitSeq: 3,
        parentCommitId: "commit-2",
        author: "human",
        idempotencyKey: null,
        createdAt: "2026-11-22T00:02:00.000Z",
      },
    ];
    const state = makeState({
      commits,
      headCommitId: "commit-3",
      promises: [promise({ id: "promise-1", commitId: "commit-1" })],
      resolutions: [
        resolution({ id: "res-1", commitId: "commit-2", status: "fulfilled" }),
        resolution({ id: "res-2", commitId: "commit-3", status: "violated" }),
      ],
    });
    expect(state.promises[0].currentStatus).toBe("violated");
  });

  it("a retracted promise disappears entirely, resolutions with it", () => {
    const state = makeState({
      promises: [promise({ id: "promise-1" })],
      resolutions: [resolution({ id: "res-1", promiseId: "promise-1" })],
      retractions: [
        {
          id: "r-1",
          branchId: "branch-1",
          commitId: "commit-1",
          entryTable: "promise",
          entryId: "promise-1",
          reason: "wrong extraction",
        },
      ],
    });
    expect(state.promises).toHaveLength(0);
  });

  it("knowledge uses follow their event: retracted event drops the use", () => {
    const state = makeState({
      events: [ev({ id: "e-1", summary: "حدث", spanStart: 1, spanEnd: 1 })],
      uses: [use({ eventId: "e-1" })],
      retractions: [
        {
          id: "r-1",
          branchId: "branch-1",
          commitId: "commit-1",
          entryTable: "event",
          entryId: "e-1",
          reason: "wrong extraction",
        },
      ],
    });
    expect(state.knowledgeUses).toHaveLength(0);
  });

  it("maxStoryEnd is the max span_end over current events, ignoring nulls", () => {
    const state = makeState({
      events: [
        ev({ id: "e-1", spanStart: 1, spanEnd: 5 }),
        ev({ id: "e-2", spanStart: 2, spanEnd: null }),
        ev({ id: "e-3", spanStart: 3, spanEnd: 9 }),
      ],
    });
    expect(state.maxStoryEnd).toBe(9);
    expect(makeState({ events: [ev({ id: "e-1", spanStart: null, spanEnd: null })] }).maxStoryEnd).toBeNull();
  });
});
