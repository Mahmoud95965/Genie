/**
 * End-to-end M1 test (spec section 10.2) — private, offline.
 *
 * Commits the dev fixture's gold state chapter by chapter (create
 * chapter -> review batch -> accept all -> commit), then runs the
 * checker. Expected findings come from the fixture's
 * `expected_findings` and are treated as TEST TARGETS for the
 * implementation, not as an accuracy metric: they say nothing about
 * model extraction quality (no real model has ever been run; the
 * "gold extraction" test replays a recording and passes by
 * construction). If a fixture and a rule ever disagree, the rule is
 * not tuned to force a pass — the disagreement is reported instead.
 */
import { describe, expect, it } from "vitest";

import { loadFixture } from "../lib/jobs/worker";
import { runChecker } from "../lib/checker/run";
import { commitBatch } from "../lib/review/commit";
import { ReviewQueue } from "../lib/review/queue";
import { InMemoryStoryworldRepository } from "../lib/state/memory-store";
import { projectState } from "../lib/state/projections";

describe("M1 end-to-end: commit the fixture gold state, run the checker", () => {
  it("produces exactly the fixture's expected findings", () => {
    const repo = new InMemoryStoryworldRepository();
    const { project, branch } = repo.createProject("Dev story");
    const queue = new ReviewQueue();
    const fixture = loadFixture("dev-short-story-v1");

    // Thread local ids across chapters: the fixture uses globally
    // unique local ids (e1..e7, p1), so chapter 3 may reference
    // chapter 2's proposition p1.
    const knownPropositions = new Map<string, string>();
    const knownEvents = new Map<string, string>();

    for (const chapter of fixture.chapters) {
      const { revision } = repo.createChapter(branch.id, {
        seq: chapter.seq,
        body: chapter.body,
        source: "import",
        expectedHead: repo.getHead(branch.id),
      });
      const batch = queue.createBatch({
        body: chapter.body,
        output: chapter.expected_extraction,
        chapterRevisionId: revision.id,
        fixtureId: fixture.fixture_id,
        chapterSeq: chapter.seq,
      });
      for (const item of batch.items) queue.accept(batch.id, item.id);
      const result = commitBatch(queue, batch.id, repo, {
        branchId: branch.id,
        expectedHead: repo.getHead(branch.id),
        knownPropositions,
        knownEvents,
      });
      for (const [localId, id] of result.mappings.propositions) knownPropositions.set(localId, id);
      for (const [localId, id] of result.mappings.events) knownEvents.set(localId, id);
    }

    // Gold state (fixture 10.1): 1 proposition, 1 dead fact for سالم,
    // 1 knowledge entry (ليلى knows p1), 1 open promise.
    const state = projectState(repo.snapshot(branch.id));
    expect(state.propositions).toHaveLength(1);
    expect(state.propositions[0].statement).toBe("الرسايل مخبأة في المنارة");
    expect(state.characterFacts).toHaveLength(1);
    expect(state.characterFacts[0].kind).toBe("dead");
    expect(state.knowledge).toHaveLength(1);
    expect(state.promises).toHaveLength(1);
    expect(state.promises[0].currentStatus).toBe("open");
    expect(state.events).toHaveLength(7);

    const p1 = knownPropositions.get("p1");
    if (!p1) throw new Error("p1 was not committed");
    const karim = repo
      .listCharacters(project.id)
      .find((c) => c.canonicalName === "كريم");
    if (!karim) throw new Error("كريم was not created");

    const findings = runChecker(repo, branch.id, {
      closedWorldPropositionIds: new Set([p1]),
    });
    // Exactly the fixture's expected findings — nothing more.
    expect(findings).toHaveLength(2);

    const deadActs = findings.filter((f) => f.ruleCode === "DEAD_ACTS");
    expect(deadActs).toHaveLength(1);
    expect(deadActs[0].confidence).toBe("confirmed");
    expect(deadActs[0].subjects).toContain(knownEvents.get("e4"));
    expect(deadActs[0].subjects).toContain(knownEvents.get("e1"));

    const leaks = findings.filter((f) => f.ruleCode === "KNOWLEDGE_LEAK");
    expect(leaks).toHaveLength(1);
    expect(leaks[0].confidence).toBe("confirmed");
    expect(leaks[0].subjects).toContain(knownEvents.get("e6"));
    expect(leaks[0].subjects).toContain(karim.id);
    expect(leaks[0].subjects).toContain(p1);

    expect(findings.filter((f) => f.ruleCode === "PROMISE_OVERDUE")).toHaveLength(0);
    expect(findings.filter((f) => f.ruleCode === "TWO_PLACES")).toHaveLength(0);
    expect(findings.filter((f) => f.ruleCode === "LOCATION_TELEPORT")).toHaveLength(0);

    // e7 (the ambiguous vision sighting) must not be flagged by any rule.
    const e7 = knownEvents.get("e7");
    expect(findings.some((f) => f.subjects.includes(e7 as string))).toBe(false);

    // Stored on the branch, raised on the current head commit.
    const stored = repo.listFindings(branch.id);
    expect(stored).toHaveLength(2);
    expect(stored.every((f) => f.resolution === "open")).toBe(true);
    expect(stored.every((f) => f.commitId === repo.getHead(branch.id))).toBe(true);

    // Re-running the checker on the same head does not duplicate findings.
    const secondRun = runChecker(repo, branch.id, {
      closedWorldPropositionIds: new Set([p1]),
    });
    expect(secondRun).toHaveLength(2);
    expect(repo.listFindings(branch.id)).toHaveLength(2);
  });
});
