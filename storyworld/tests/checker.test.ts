/**
 * Rule checker unit tests (M1) — spec sections 7 and 10.2.
 *
 * Synthetic states only; every rule is tested with its positive case
 * AND its negatives (resurrection, flashback, adjacent intervals, null
 * bounds, open vs closed world, unknown use time). Nothing here measures
 * extraction quality — the checker runs over state that is handed to it.
 */
import { describe, expect, it } from "vitest";

import {
  checkDeadActs,
  checkKnowledgeLeak,
  checkLocationTeleport,
  checkPromiseOverdue,
  checkTwoPlaces,
  runAllChecks,
  type CheckerNote,
} from "../lib/checker/rules";
import { CHAR, denial, ev, fact, know, makeState, part, promise, resolution, use } from "./helpers";

describe("DEAD_ACTS", () => {
  const death = () =>
    ev({ id: "e-death", kind: "death", summary: "مات سالم", spanStart: 2, spanEnd: 2 });
  const deathFact = () => fact({ id: "f-dead", validFromEventId: "e-death" });

  it("flags a death at t2 followed by an act at t3 (confirmed)", () => {
    const state = makeState({
      events: [
        death(),
        ev({ id: "e-act", kind: "action", summary: "ضحك سالم", spanStart: 3, spanEnd: 3 }),
      ],
      participants: [
        part("e-death", CHAR.salim, "victim"),
        part("e-act", CHAR.salim, "actor"),
      ],
      facts: [deathFact()],
    });
    const findings = checkDeadActs(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("confirmed");
    expect(findings[0].ruleCode).toBe("DEAD_ACTS");
    expect(findings[0].subjects).toContain("e-act");
    expect(findings[0].subjects).toContain("e-death");
    // Dual evidence: death quote (state) + acting quote (text).
    expect(findings[0].evidence.some((e) => e.role === "state")).toBe(true);
    expect(findings[0].evidence.some((e) => e.role === "text")).toBe(true);
  });

  it("does NOT flag an act at t5 after a resurrection at t4", () => {
    // Note: the resurrection event itself must not cast سالم as
    // actor/speaker — under the spec SQL, an action by the dead
    // character at t4 would itself be flagged (its own alive fact's
    // event ends at 4, and 4 < 4 is false, so the latest life-state
    // at t4 is still dead). The resurrection is observed, not acted.
    const state = makeState({
      events: [
        death(),
        ev({ id: "e-alive", kind: "observation", summary: "عاد سالم إلى الحياة", spanStart: 4, spanEnd: 4 }),
        ev({ id: "e-act", kind: "action", summary: "ضحك سالم", spanStart: 5, spanEnd: 5 }),
      ],
      participants: [
        part("e-death", CHAR.salim, "victim"),
        part("e-alive", CHAR.omar, "observer"),
        part("e-alive", CHAR.salim, "subject"),
        part("e-act", CHAR.salim, "actor"),
      ],
      facts: [
        deathFact(),
        fact({ id: "f-alive", kind: "alive", value: "حي", validFromEventId: "e-alive" }),
      ],
    });
    expect(checkDeadActs(state)).toHaveLength(0);
  });

  it("does NOT flag an act at t1 (flashback before the death at t2)", () => {
    const state = makeState({
      events: [
        ev({ id: "e-act", kind: "action", summary: "ضحك سالم", spanStart: 1, spanEnd: 1 }),
        death(),
      ],
      participants: [
        part("e-act", CHAR.salim, "actor"),
        part("e-death", CHAR.salim, "victim"),
      ],
      facts: [deathFact()],
    });
    expect(checkDeadActs(state)).toHaveLength(0);
  });

  it("a dream action by a dead character is uncertain, never confirmed", () => {
    const state = makeState({
      events: [
        death(),
        ev({
          id: "e-dream",
          kind: "action",
          summary: "سالم في الحلم",
          spanStart: 3,
          spanEnd: 3,
          realityScope: "dream",
        }),
      ],
      participants: [
        part("e-death", CHAR.salim, "victim"),
        part("e-dream", CHAR.salim, "actor"),
      ],
      facts: [deathFact()],
    });
    const findings = checkDeadActs(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("uncertain");
    expect(findings[0].reason).toBe("non_real_action");
  });

  it("an ambiguous action by a dead character is uncertain, never confirmed", () => {
    const state = makeState({
      events: [
        death(),
        ev({
          id: "e-amb",
          kind: "action",
          summary: "ربما ضحك سالم",
          spanStart: 3,
          spanEnd: 3,
          certainty: "ambiguous",
        }),
      ],
      participants: [
        part("e-death", CHAR.salim, "victim"),
        part("e-amb", CHAR.salim, "actor"),
      ],
      facts: [deathFact()],
    });
    const findings = checkDeadActs(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("uncertain");
    expect(findings[0].reason).toBe("ambiguous_action");
  });

  it("a speaker triggers it, an observer does not", () => {
    const base = {
      events: [
        death(),
        ev({ id: "e-talk", kind: "dialogue", summary: "قال سالم", spanStart: 3, spanEnd: 3 }),
        ev({ id: "e-see", kind: "observation", summary: "رأى عمر سالم", spanStart: 4, spanEnd: 4 }),
      ],
      facts: [deathFact()],
    };
    const speaker = makeState({
      ...base,
      participants: [part("e-death", CHAR.salim, "victim"), part("e-talk", CHAR.salim, "speaker")],
    });
    expect(checkDeadActs(speaker)).toHaveLength(1);
    const observer = makeState({
      ...base,
      participants: [part("e-death", CHAR.salim, "victim"), part("e-see", CHAR.salim, "observer")],
    });
    expect(checkDeadActs(observer)).toHaveLength(0);
  });

  it("a death inside a dream does not establish a life-state", () => {
    const state = makeState({
      events: [
        ev({
          id: "e-death",
          kind: "death",
          summary: "مات سالم في الحلم",
          spanStart: 2,
          spanEnd: 2,
          realityScope: "dream",
        }),
        ev({ id: "e-act", kind: "action", summary: "ضحك سالم", spanStart: 3, spanEnd: 3 }),
      ],
      participants: [
        part("e-death", CHAR.salim, "victim"),
        part("e-act", CHAR.salim, "actor"),
      ],
      facts: [deathFact()],
    });
    expect(checkDeadActs(state)).toHaveLength(0);
  });

  it("a retracted death fact does not flag", () => {
    const state = makeState({
      events: [
        death(),
        ev({ id: "e-act", kind: "action", summary: "ضحك سالم", spanStart: 3, spanEnd: 3 }),
      ],
      participants: [
        part("e-death", CHAR.salim, "victim"),
        part("e-act", CHAR.salim, "actor"),
      ],
      facts: [deathFact()],
      retractions: [
        {
          id: "r-1",
          branchId: "branch-1",
          commitId: "commit-1",
          entryTable: "character_fact",
          entryId: "f-dead",
          reason: "wrong extraction",
        },
      ],
    });
    expect(checkDeadActs(state)).toHaveLength(0);
  });
});

describe("DEAD_ACTS (M1.1): resurrection own-event exception (4a) and ties (4b)", () => {
  const death = () =>
    ev({ id: "e-death", kind: "death", summary: "مات سالم", spanStart: 2, spanEnd: 2 });
  const deathFact = () => fact({ id: "f-dead", validFromEventId: "e-death" });

  it("4a: a resurrection event casting the dead character as actor is NOT flagged, and is recorded as cleared", () => {
    const state = makeState({
      events: [
        death(),
        ev({ id: "e-res", kind: "action", summary: "فتح سالم عينيه وتكلم", spanStart: 4, spanEnd: 4 }),
        ev({ id: "e-act", kind: "action", summary: "ضحك سالم", spanStart: 5, spanEnd: 5 }),
      ],
      participants: [
        part("e-death", CHAR.salim, "victim"),
        part("e-res", CHAR.salim, "actor"),
        part("e-act", CHAR.salim, "actor"),
      ],
      facts: [
        deathFact(),
        fact({ id: "f-alive", kind: "alive", value: "حي", validFromEventId: "e-res" }),
      ],
    });
    const notes: CheckerNote[] = [];
    const findings = checkDeadActs(state, notes);
    expect(findings).toHaveLength(0);
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe("own_event_resurrection");
    expect(notes[0].factId).toBe("f-alive");
    expect(notes[0].eventId).toBe("e-res");
    // The note is surfaced by runAllChecks, and is not a finding.
    const run = runAllChecks(state);
    expect(run.findings).toHaveLength(0);
    expect(run.notes).toHaveLength(1);
    expect(run.notes[0].type).toBe("own_event_resurrection");
  });

  it("4a: an unrelated character's resurrection at t3 does not clear سالم's act at t3", () => {
    const state = makeState({
      events: [
        death(),
        ev({ id: "e-res-omar", kind: "action", summary: "عاد عمر إلى الحياة", spanStart: 3, spanEnd: 3 }),
        ev({ id: "e-act", kind: "action", summary: "ضحك سالم", spanStart: 3, spanEnd: 3 }),
      ],
      participants: [
        part("e-death", CHAR.salim, "victim"),
        part("e-res-omar", CHAR.omar, "actor"),
        part("e-act", CHAR.salim, "actor"),
      ],
      facts: [
        deathFact(),
        fact({
          id: "f-alive-omar",
          characterId: CHAR.omar,
          kind: "alive",
          value: "حي",
          validFromEventId: "e-res-omar",
        }),
      ],
    });
    const findings = checkDeadActs(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("confirmed");
  });

  it("4b: dead and alive facts at equal span_end in the same commit: uncertain conflict, not confirmed", () => {
    const state = makeState({
      events: [
        death(),
        ev({ id: "e-alive", kind: "observation", summary: "سالم حي", spanStart: 2, spanEnd: 2 }),
        ev({ id: "e-act", kind: "action", summary: "ضحك سالم", spanStart: 3, spanEnd: 3 }),
      ],
      participants: [
        part("e-death", CHAR.salim, "victim"),
        part("e-alive", CHAR.salim, "subject"),
        part("e-act", CHAR.salim, "actor"),
      ],
      facts: [
        deathFact(),
        fact({ id: "f-alive", kind: "alive", value: "حي", validFromEventId: "e-alive" }),
      ],
    });
    const findings = checkDeadActs(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("uncertain");
    expect(findings[0].reason).toBe("conflicting_life_state_same_point");
    expect(findings[0].subjects).toContain("f-dead");
    expect(findings[0].subjects).toContain("f-alive");
    // Both evidence quotes are cited.
    expect(findings[0].evidence.some((e) => e.quote === "مات سالم")).toBe(true);
    expect(findings[0].evidence.some((e) => e.quote === "سالم حي")).toBe(true);
  });

  it("4b: same facts in different commits: the later commit wins (spec rule kept)", () => {
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
    ];
    const events = [
      death(),
      ev({ id: "e-alive", kind: "observation", summary: "سالم حي", spanStart: 2, spanEnd: 2 }),
      ev({ id: "e-act", kind: "action", summary: "ضحك سالم", spanStart: 3, spanEnd: 3 }),
    ];
    const participants = [
      part("e-death", CHAR.salim, "victim"),
      part("e-alive", CHAR.salim, "subject"),
      part("e-act", CHAR.salim, "actor"),
    ];
    // Alive fact in the later commit wins: no flag.
    const aliveWins = makeState({
      commits,
      events,
      participants,
      facts: [
        deathFact(),
        fact({ id: "f-alive", kind: "alive", value: "حي", validFromEventId: "e-alive", commitId: "commit-2" }),
      ],
    });
    expect(checkDeadActs(aliveWins)).toHaveLength(0);
    // Dead fact in the later commit wins: confirmed.
    const deadWins = makeState({
      commits,
      events,
      participants,
      facts: [
        fact({ id: "f-alive", kind: "alive", value: "حي", validFromEventId: "e-alive", commitId: "commit-1" }),
        fact({ id: "f-dead", validFromEventId: "e-death", commitId: "commit-2" }),
      ],
    });
    const findings = checkDeadActs(deadWins);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("confirmed");
  });

  it("4b: two dead facts at equal span_end: act after is confirmed as before", () => {
    const state = makeState({
      events: [
        death(),
        ev({ id: "e-death2", kind: "death", summary: "مات سالم مرة أخرى", spanStart: 2, spanEnd: 2 }),
        ev({ id: "e-act", kind: "action", summary: "ضحك سالم", spanStart: 3, spanEnd: 3 }),
      ],
      participants: [
        part("e-death", CHAR.salim, "victim"),
        part("e-death2", CHAR.salim, "victim"),
        part("e-act", CHAR.salim, "actor"),
      ],
      facts: [
        deathFact(),
        fact({ id: "f-dead2", validFromEventId: "e-death2" }),
      ],
    });
    const findings = checkDeadActs(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("confirmed");
  });
});

describe("KNOWLEDGE_LEAK", () => {
  const learn = () =>
    ev({ id: "e-learn", kind: "knowledge_transfer", summary: "قال عمر لليلى", spanStart: 3, spanEnd: 3 });
  const useEvent = (overrides: Record<string, unknown> = {}) =>
    ev({
      id: "e-use",
      kind: "knowledge_use",
      summary: "فكر كريم في الرسايل",
      spanStart: 6,
      spanEnd: 6,
      ...(overrides as object),
    });

  it("closed-world leak is confirmed", () => {
    const state = makeState({
      events: [learn(), useEvent()],
      participants: [
        part("e-learn", CHAR.omar, "speaker"),
        part("e-learn", CHAR.layla, "listener"),
        part("e-use", CHAR.karim, "subject"),
      ],
      knowledge: [know({ id: "k-1", characterId: CHAR.layla, learnedAtEventId: "e-learn" })],
      uses: [use({ eventId: "e-use" })],
    });
    const findings = checkKnowledgeLeak(state, {
      closedWorldPropositionIds: new Set(["prop-1"]),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("confirmed");
    expect(findings[0].subjects).toContain("e-use");
    expect(findings[0].subjects).toContain(CHAR.karim);
  });

  it("open-world leak is uncertain, never confirmed", () => {
    const state = makeState({
      events: [learn(), useEvent()],
      participants: [
        part("e-learn", CHAR.omar, "speaker"),
        part("e-learn", CHAR.layla, "listener"),
        part("e-use", CHAR.karim, "subject"),
      ],
      knowledge: [know({ id: "k-1", characterId: CHAR.layla, learnedAtEventId: "e-learn" })],
      uses: [use({ eventId: "e-use" })],
    });
    const findings = checkKnowledgeLeak(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("uncertain");
    expect(findings[0].reason).toBe("open_world");
  });

  it("unknown use time can never be confirmed, even closed-world", () => {
    const state = makeState({
      events: [learn(), useEvent({ spanStart: null, spanEnd: null })],
      participants: [
        part("e-learn", CHAR.omar, "speaker"),
        part("e-learn", CHAR.layla, "listener"),
        part("e-use", CHAR.karim, "subject"),
      ],
      knowledge: [know({ id: "k-1", characterId: CHAR.layla, learnedAtEventId: "e-learn" })],
      uses: [use({ eventId: "e-use" })],
    });
    const findings = checkKnowledgeLeak(state, {
      closedWorldPropositionIds: new Set(["prop-1"]),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("uncertain");
    expect(findings[0].reason).toBe("unknown_use_time");
  });

  it("witnessed same-instant learning is allowed", () => {
    const state = makeState({
      events: [
        ev({ id: "e-learn", kind: "observation", summary: "رأى كريم الرسايل", spanStart: 6, spanEnd: 6 }),
        useEvent(),
      ],
      participants: [
        part("e-learn", CHAR.karim, "observer"),
        part("e-use", CHAR.karim, "subject"),
      ],
      knowledge: [
        know({ id: "k-1", characterId: CHAR.karim, learnedAtEventId: "e-learn", learnedHow: "witnessed" }),
      ],
      uses: [use({ eventId: "e-use" })],
    });
    expect(
      checkKnowledgeLeak(state, { closedWorldPropositionIds: new Set(["prop-1"]) }),
    ).toHaveLength(0);
  });

  it("told same-instant learning is NOT allowed (must be strictly earlier)", () => {
    const state = makeState({
      events: [
        ev({ id: "e-learn", kind: "knowledge_transfer", summary: "قال عمر لكريم", spanStart: 6, spanEnd: 6 }),
        useEvent(),
      ],
      participants: [
        part("e-learn", CHAR.omar, "speaker"),
        part("e-learn", CHAR.karim, "listener"),
        part("e-use", CHAR.karim, "subject"),
      ],
      knowledge: [
        know({ id: "k-1", characterId: CHAR.karim, learnedAtEventId: "e-learn", learnedHow: "told" }),
      ],
      uses: [use({ eventId: "e-use" })],
    });
    const findings = checkKnowledgeLeak(state, {
      closedWorldPropositionIds: new Set(["prop-1"]),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("confirmed");
  });

  it("learning strictly earlier clears the use", () => {
    const state = makeState({
      events: [learn(), useEvent()],
      participants: [
        part("e-learn", CHAR.omar, "speaker"),
        part("e-learn", CHAR.karim, "listener"),
        part("e-use", CHAR.karim, "subject"),
      ],
      knowledge: [know({ id: "k-1", characterId: CHAR.karim, learnedAtEventId: "e-learn" })],
      uses: [use({ eventId: "e-use" })],
    });
    expect(
      checkKnowledgeLeak(state, { closedWorldPropositionIds: new Set(["prop-1"]) }),
    ).toHaveLength(0);
  });

  it("a false_belief knowledge entry still counts as having a belief", () => {
    const state = makeState({
      events: [learn(), useEvent()],
      participants: [
        part("e-learn", CHAR.omar, "speaker"),
        part("e-learn", CHAR.karim, "listener"),
        part("e-use", CHAR.karim, "subject"),
      ],
      knowledge: [
        know({ id: "k-1", characterId: CHAR.karim, learnedAtEventId: "e-learn", certainty: "false_belief" }),
      ],
      uses: [use({ eventId: "e-use" })],
    });
    expect(
      checkKnowledgeLeak(state, { closedWorldPropositionIds: new Set(["prop-1"]) }),
    ).toHaveLength(0);
  });

  it("a non-asserted use event produces no finding at all", () => {
    const state = makeState({
      events: [learn(), useEvent({ certainty: "ambiguous" })],
      participants: [
        part("e-learn", CHAR.omar, "speaker"),
        part("e-learn", CHAR.layla, "listener"),
        part("e-use", CHAR.karim, "subject"),
      ],
      knowledge: [know({ id: "k-1", characterId: CHAR.layla, learnedAtEventId: "e-learn" })],
      uses: [use({ eventId: "e-use" })],
    });
    expect(
      checkKnowledgeLeak(state, { closedWorldPropositionIds: new Set(["prop-1"]) }),
    ).toHaveLength(0);
  });

  it("an explicit record of non-knowledge confirms the leak", () => {
    const state = makeState({
      events: [learn(), useEvent()],
      participants: [
        part("e-learn", CHAR.omar, "speaker"),
        part("e-learn", CHAR.layla, "listener"),
        part("e-use", CHAR.karim, "subject"),
      ],
      knowledge: [know({ id: "k-1", characterId: CHAR.layla, learnedAtEventId: "e-learn" })],
      uses: [use({ eventId: "e-use" })],
    });
    const findings = checkKnowledgeLeak(state, {
      explicitNonKnowledge: new Set([`${CHAR.karim}:prop-1`]),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("confirmed");
  });

  it("M1.1 (6): closed-world, only learn is in a dream, no mark: uncertain learned_only_in_non_real_event", () => {
    const state = makeState({
      events: [
        ev({
          id: "e-dream-learn",
          kind: "knowledge_transfer",
          summary: "حلم كريم بالرسايل",
          spanStart: 3,
          spanEnd: 3,
          realityScope: "dream",
        }),
        useEvent(),
      ],
      participants: [
        part("e-dream-learn", CHAR.karim, "listener"),
        part("e-use", CHAR.karim, "subject"),
      ],
      knowledge: [
        know({ id: "k-1", characterId: CHAR.karim, learnedAtEventId: "e-dream-learn", learnedHow: "told" }),
      ],
      uses: [use({ eventId: "e-use" })],
    });
    const findings = checkKnowledgeLeak(state, {
      closedWorldPropositionIds: new Set(["prop-1"]),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("uncertain");
    expect(findings[0].reason).toBe("learned_only_in_non_real_event");
    // The dream learn event and its evidence quote are cited.
    expect(findings[0].subjects).toContain("e-dream-learn");
    expect(findings[0].evidence.some((e) => e.quote === "حلم كريم بالرسايل")).toBe(true);
  });

  it("M1.1 (6): dream learn with a reviewer learned_in_story mark clears the leak", () => {
    const state = makeState({
      events: [
        ev({
          id: "e-dream-learn",
          kind: "knowledge_transfer",
          summary: "حلم كريم بالرسايل",
          spanStart: 3,
          spanEnd: 3,
          realityScope: "dream",
        }),
        useEvent(),
      ],
      participants: [
        part("e-dream-learn", CHAR.karim, "listener"),
        part("e-use", CHAR.karim, "subject"),
      ],
      knowledge: [
        know({
          id: "k-1",
          characterId: CHAR.karim,
          learnedAtEventId: "e-dream-learn",
          learnedHow: "told",
          learnedInStory: true,
          learnedInStoryEvidence: [
            {
              quote: "تذكر كريم الحلم",
              startOffset: 0,
              endOffset: 15,
              chapterRevisionId: "rev-1",
              bodySha256: "sha",
            },
          ],
        }),
      ],
      uses: [use({ eventId: "e-use" })],
    });
    expect(
      checkKnowledgeLeak(state, { closedWorldPropositionIds: new Set(["prop-1"]) }),
    ).toHaveLength(0);
  });

  it("M1.1 (6): non-real learn plus a later real learn before the use: no finding", () => {
    const state = makeState({
      events: [
        ev({
          id: "e-dream-learn",
          kind: "knowledge_transfer",
          summary: "حلم كريم بالرسايل",
          spanStart: 3,
          spanEnd: 3,
          realityScope: "dream",
        }),
        ev({ id: "e-real-learn", kind: "knowledge_transfer", summary: "قال عمر لكريم", spanStart: 5, spanEnd: 5 }),
        useEvent(),
      ],
      participants: [
        part("e-dream-learn", CHAR.karim, "listener"),
        part("e-real-learn", CHAR.omar, "speaker"),
        part("e-real-learn", CHAR.karim, "listener"),
        part("e-use", CHAR.karim, "subject"),
      ],
      knowledge: [
        know({ id: "k-1", characterId: CHAR.karim, learnedAtEventId: "e-dream-learn", learnedHow: "told" }),
        know({ id: "k-2", characterId: CHAR.karim, learnedAtEventId: "e-real-learn", learnedHow: "told" }),
      ],
      uses: [use({ eventId: "e-use" })],
    });
    expect(
      checkKnowledgeLeak(state, { closedWorldPropositionIds: new Set(["prop-1"]) }),
    ).toHaveLength(0);
  });

  // --- M1.1 item 3: explicit non-knowledge records (knowledge_denial) ---
  const denyEvent = () =>
    ev({
      id: "e-deny",
      kind: "observation",
      summary: "قال كريم: لا أعرف أين الرسايل",
      spanStart: 2,
      spanEnd: 2,
    });
  const denialEvidence = [
    {
      quote: "قال كريم: لا أعرف أين الرسايل",
      startOffset: 0,
      endOffset: 30,
      chapterRevisionId: "rev-1",
      bodySha256: "sha",
    },
  ];

  it("M1.1 (3): denial at t2, use at t3, no learning: confirmed (open world)", () => {
    const state = makeState({
      events: [denyEvent(), useEvent()],
      participants: [part("e-deny", CHAR.karim, "speaker"), part("e-use", CHAR.karim, "subject")],
      denials: [denial({ id: "d-1", evidence: denialEvidence })],
      uses: [use({ eventId: "e-use" })],
    });
    const findings = checkKnowledgeLeak(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("confirmed");
    expect(findings[0].subjects).toContain("d-1");
    expect(findings[0].evidence.some((e) => e.quote === "قال كريم: لا أعرف أين الرسايل")).toBe(true);
  });

  it("M1.1 (3): denial at t2, real learning at t3, use at t6: no finding", () => {
    const state = makeState({
      events: [
        denyEvent(),
        ev({ id: "e-learn", kind: "knowledge_transfer", summary: "قال عمر لكريم", spanStart: 3, spanEnd: 3 }),
        useEvent(),
      ],
      participants: [
        part("e-deny", CHAR.karim, "speaker"),
        part("e-learn", CHAR.omar, "speaker"),
        part("e-learn", CHAR.karim, "listener"),
        part("e-use", CHAR.karim, "subject"),
      ],
      denials: [denial({ id: "d-1", evidence: denialEvidence })],
      knowledge: [know({ id: "k-1", characterId: CHAR.karim, learnedAtEventId: "e-learn" })],
      uses: [use({ eventId: "e-use" })],
    });
    expect(checkKnowledgeLeak(state)).toHaveLength(0);
  });

  it("M1.1 (3): denial at t2, use at t1 before the denial: no confirmation from the denial alone", () => {
    const state = makeState({
      events: [denyEvent(), useEvent({ spanStart: 1, spanEnd: 1 })],
      participants: [part("e-deny", CHAR.karim, "speaker"), part("e-use", CHAR.karim, "subject")],
      denials: [denial({ id: "d-1", evidence: denialEvidence })],
      uses: [use({ eventId: "e-use" })],
    });
    const findings = checkKnowledgeLeak(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("uncertain");
    expect(findings[0].reason).toBe("open_world");
  });

  it("M1.1 (3): denial with unknown use time: uncertain unknown_use_time, never confirmed", () => {
    const state = makeState({
      events: [denyEvent(), useEvent({ spanStart: null, spanEnd: null })],
      participants: [part("e-deny", CHAR.karim, "speaker"), part("e-use", CHAR.karim, "subject")],
      denials: [denial({ id: "d-1", evidence: denialEvidence })],
      uses: [use({ eventId: "e-use" })],
    });
    const findings = checkKnowledgeLeak(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("uncertain");
    expect(findings[0].reason).toBe("unknown_use_time");
  });
});

describe("TWO_PLACES", () => {
  const at = (id: string, location: string, start: number | null, end: number | null) =>
    ev({ id, kind: "observation", summary: `${id} at ${location}`, location, spanStart: start, spanEnd: end });

  it("overlapping intervals at different locations are confirmed", () => {
    const state = makeState({
      events: [at("e-a", "المنارة", 1, 5), at("e-b", "الميناء", 3, 7)],
      participants: [part("e-a", CHAR.omar, "subject"), part("e-b", CHAR.omar, "subject")],
    });
    const findings = checkTwoPlaces(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("confirmed");
  });

  it("adjacent intervals (end 5, start 6) are NOT flagged", () => {
    const state = makeState({
      events: [at("e-a", "المنارة", 1, 5), at("e-b", "الميناء", 6, 8)],
      participants: [part("e-a", CHAR.omar, "subject"), part("e-b", CHAR.omar, "subject")],
    });
    expect(checkTwoPlaces(state)).toHaveLength(0);
  });

  it("M1.1 (5): intervals touching at exactly one shared endpoint are uncertain, not confirmed", () => {
    const state = makeState({
      events: [at("e-a", "المنارة", 1, 2), at("e-b", "الميناء", 2, 3)],
      participants: [part("e-a", CHAR.omar, "subject"), part("e-b", CHAR.omar, "subject")],
    });
    const findings = checkTwoPlaces(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("uncertain");
    expect(findings[0].reason).toBe("touching_interval");
  });

  it("M1.1 (5): [1,3] vs [2,4] positive-length overlap is confirmed", () => {
    const state = makeState({
      events: [at("e-a", "المنارة", 1, 3), at("e-b", "الميناء", 2, 4)],
      participants: [part("e-a", CHAR.omar, "subject"), part("e-b", CHAR.omar, "subject")],
    });
    const findings = checkTwoPlaces(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("confirmed");
  });

  it("M1.1 (5): [1,2] vs [3,4] separated intervals are NOT flagged", () => {
    const state = makeState({
      events: [at("e-a", "المنارة", 1, 2), at("e-b", "الميناء", 3, 4)],
      participants: [part("e-a", CHAR.omar, "subject"), part("e-b", CHAR.omar, "subject")],
    });
    expect(checkTwoPlaces(state)).toHaveLength(0);
  });

  it("M1.1 (5): two point events at the same instant are confirmed", () => {
    const state = makeState({
      events: [at("e-a", "المنارة", 2, 2), at("e-b", "الميناء", 2, 2)],
      participants: [part("e-a", CHAR.omar, "subject"), part("e-b", CHAR.omar, "subject")],
    });
    const findings = checkTwoPlaces(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("confirmed");
  });

  it("M1.1 (5): a point on an endpoint of the other interval is uncertain", () => {
    const state = makeState({
      events: [at("e-a", "المنارة", 2, 2), at("e-b", "الميناء", 2, 3)],
      participants: [part("e-a", CHAR.omar, "subject"), part("e-b", CHAR.omar, "subject")],
    });
    const findings = checkTwoPlaces(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("uncertain");
    expect(findings[0].reason).toBe("touching_interval");
  });

  it("M1.1 (5): a point strictly inside the other interval is confirmed", () => {
    const state = makeState({
      events: [at("e-a", "المنارة", 2, 2), at("e-b", "الميناء", 1, 3)],
      participants: [part("e-a", CHAR.omar, "subject"), part("e-b", CHAR.omar, "subject")],
    });
    const findings = checkTwoPlaces(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("confirmed");
  });

  it("M1.1 (5): a point on the far endpoint of the other interval is uncertain", () => {
    const state = makeState({
      events: [at("e-a", "المنارة", 3, 3), at("e-b", "الميناء", 1, 3)],
      participants: [part("e-a", CHAR.omar, "subject"), part("e-b", CHAR.omar, "subject")],
    });
    const findings = checkTwoPlaces(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("uncertain");
    expect(findings[0].reason).toBe("touching_interval");
  });

  it("null bounds never flag", () => {
    const state = makeState({
      events: [at("e-a", "المنارة", null, null), at("e-b", "الميناء", 3, 7)],
      participants: [part("e-a", CHAR.omar, "subject"), part("e-b", CHAR.omar, "subject")],
    });
    expect(checkTwoPlaces(state)).toHaveLength(0);
  });

  it("same location is NOT flagged", () => {
    const state = makeState({
      events: [at("e-a", "المنارة", 1, 5), at("e-b", "المنارة", 3, 7)],
      participants: [part("e-a", CHAR.omar, "subject"), part("e-b", CHAR.omar, "subject")],
    });
    expect(checkTwoPlaces(state)).toHaveLength(0);
  });

  it("different characters at different locations are NOT flagged", () => {
    const state = makeState({
      events: [at("e-a", "المنارة", 1, 5), at("e-b", "الميناء", 3, 7)],
      participants: [part("e-a", CHAR.omar, "subject"), part("e-b", CHAR.layla, "subject")],
    });
    expect(checkTwoPlaces(state)).toHaveLength(0);
  });
});

describe("PROMISE_OVERDUE", () => {
  const raise = () => ev({ id: "e-raise", kind: "promise_raised", summary: "وعد عمر", spanStart: 5, spanEnd: 5 });
  const deadline = (end: number | null) =>
    ev({ id: "e-deadline", kind: "action", summary: "الموعد", spanStart: 6, spanEnd: end });
  const later = () => ev({ id: "e-later", kind: "action", summary: "بعد الموعد", spanStart: 9, spanEnd: 9 });

  it("open promise past its deadline event is confirmed", () => {
    const state = makeState({
      events: [raise(), deadline(7), later()],
      promises: [promise({ id: "promise-1", raisedAtEventId: "e-raise", deadlineEventId: "e-deadline" })],
    });
    const findings = checkPromiseOverdue(state);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("confirmed");
  });

  it("an open promise with no deadline is never flagged", () => {
    const state = makeState({
      events: [raise(), later()],
      promises: [promise({ id: "promise-1", raisedAtEventId: "e-raise", deadlineEventId: null })],
    });
    expect(checkPromiseOverdue(state)).toHaveLength(0);
  });

  it("a fulfilled promise is never flagged", () => {
    const state = makeState({
      events: [raise(), deadline(7), later()],
      promises: [promise({ id: "promise-1", raisedAtEventId: "e-raise", deadlineEventId: "e-deadline" })],
      resolutions: [resolution({ id: "res-1", promiseId: "promise-1", status: "fulfilled" })],
    });
    expect(checkPromiseOverdue(state)).toHaveLength(0);
  });

  it("deadline equal to the latest story order is NOT overdue (strict <)", () => {
    const state = makeState({
      events: [raise(), deadline(9), later()],
      promises: [promise({ id: "promise-1", raisedAtEventId: "e-raise", deadlineEventId: "e-deadline" })],
    });
    expect(checkPromiseOverdue(state)).toHaveLength(0);
  });

  it("a retracted deadline event is NOT overdue (cannot be evaluated)", () => {
    const state = makeState({
      events: [raise(), deadline(7), later()],
      promises: [promise({ id: "promise-1", raisedAtEventId: "e-raise", deadlineEventId: "e-deadline" })],
      retractions: [
        {
          id: "r-1",
          branchId: "branch-1",
          commitId: "commit-1",
          entryTable: "event",
          entryId: "e-deadline",
          reason: "wrong extraction",
        },
      ],
    });
    expect(checkPromiseOverdue(state)).toHaveLength(0);
  });

  it("a text deadline_condition alone produces no code finding", () => {
    const state = makeState({
      events: [raise(), later()],
      promises: [
        promise({
          id: "promise-1",
          raisedAtEventId: "e-raise",
          deadlineEventId: null,
          deadlineCondition: "قبل نهاية الشتاء",
        }),
      ],
    });
    expect(checkPromiseOverdue(state)).toHaveLength(0);
  });
});

describe("LOCATION_TELEPORT (advisory only)", () => {
  const isDistant = (a: string, b: string) => a !== b;

  it("yields no findings without an isDistant predicate (rule unconfigured)", () => {
    const state = makeState({
      events: [
        ev({ id: "e-a", kind: "observation", summary: "عمر في المنارة", location: "المنارة", spanStart: 1, spanEnd: 1 }),
        ev({ id: "e-b", kind: "observation", summary: "عمر في الميناء", location: "الميناء", spanStart: 2, spanEnd: 2 }),
      ],
      participants: [part("e-a", CHAR.omar, "subject"), part("e-b", CHAR.omar, "subject")],
    });
    expect(checkLocationTeleport(state)).toHaveLength(0);
  });

  it("consecutive different locations with no movement are uncertain", () => {
    const state = makeState({
      events: [
        ev({ id: "e-a", kind: "observation", summary: "عمر في المنارة", location: "المنارة", spanStart: 1, spanEnd: 1 }),
        ev({ id: "e-b", kind: "observation", summary: "عمر في الميناء", location: "الميناء", spanStart: 2, spanEnd: 2 }),
      ],
      participants: [part("e-a", CHAR.omar, "subject"), part("e-b", CHAR.omar, "subject")],
    });
    const findings = checkLocationTeleport(state, { isDistant });
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("uncertain");
    expect(findings[0].reason).toBe("no_intervening_movement");
  });

  it("an intervening movement event clears it", () => {
    const state = makeState({
      events: [
        ev({ id: "e-a", kind: "observation", summary: "عمر في المنارة", location: "المنارة", spanStart: 1, spanEnd: 1 }),
        ev({ id: "e-move", kind: "movement", summary: "سافر عمر", spanStart: 2, spanEnd: 2 }),
        ev({ id: "e-b", kind: "observation", summary: "عمر في الميناء", location: "الميناء", spanStart: 3, spanEnd: 3 }),
      ],
      participants: [
        part("e-a", CHAR.omar, "subject"),
        part("e-move", CHAR.omar, "actor"),
        part("e-b", CHAR.omar, "subject"),
      ],
    });
    expect(checkLocationTeleport(state, { isDistant })).toHaveLength(0);
  });

  it("same location twice is NOT flagged", () => {
    const state = makeState({
      events: [
        ev({ id: "e-a", kind: "observation", summary: "عمر في المنارة", location: "المنارة", spanStart: 1, spanEnd: 1 }),
        ev({ id: "e-b", kind: "observation", summary: "عمر في المنارة", location: "المنارة", spanStart: 2, spanEnd: 2 }),
      ],
      participants: [part("e-a", CHAR.omar, "subject"), part("e-b", CHAR.omar, "subject")],
    });
    expect(checkLocationTeleport(state, { isDistant })).toHaveLength(0);
  });
});
