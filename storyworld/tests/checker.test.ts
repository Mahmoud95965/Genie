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
} from "../lib/checker/rules";
import { CHAR, ev, fact, know, makeState, part, promise, resolution, use } from "./helpers";

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

  it("intervals sharing one endpoint count as overlapping (spec formula uses <=)", () => {
    const state = makeState({
      events: [at("e-a", "المنارة", 1, 5), at("e-b", "الميناء", 5, 8)],
      participants: [part("e-a", CHAR.omar, "subject"), part("e-b", CHAR.omar, "subject")],
    });
    expect(checkTwoPlaces(state)).toHaveLength(1);
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
