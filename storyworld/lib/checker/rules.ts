/**
 * Deterministic rule checker (M1, M1.1) — spec section 7. Pure functions, no LLM.
 *
 * Runs over projected state (see `../state/projections`). Every finding
 * carries confidence and dual evidence where applicable.
 *
 * Honesty requirement (spec section 7): the checker covers only
 * explicitly represented rules over correctly extracted state.
 * Extraction errors compound. A clean run is not proof of consistency.
 *
 * Documented readings / open questions (see also docs/storyworld.md):
 * - LOCATION_TELEPORT: "distant" has no definition in the spec — there
 *   is no location or distance model anywhere. The rule is implemented
 *   with a caller-supplied `isDistant` predicate; without one it yields
 *   no findings (marked unconfigured). This is an open question, not a
 *   silent choice. (M1.1 item 1: stays off.)
 * - TWO_PLACES: M1 followed the spec formula literally (`<=`, so
 *   intervals sharing one endpoint counted as overlapping). M1.1
 *   DEPARTS from the literal formula (approved by the owner): a
 *   single shared endpoint is `uncertain` (`touching_interval`);
 *   only positive-length overlap, a point strictly inside the other
 *   interval, or two point events at the same instant are `confirmed`.
 * - KNOWLEDGE_LEAK: M1 followed the spec SQL literally (only span
 *   order and channel conditions matter). M1.1 DEPARTS from it
 *   (approved): when the only qualifying learn event is non-asserted
 *   or non-real, the finding is `uncertain`
 *   (`learned_only_in_non_real_event`) unless the reviewer marked the
 *   entry `learned_in_story` with evidence. An "explicit evidenced
 *   record of non-knowledge" is now a stored ledger entry
 *   (`knowledge_denial`, M1.1 item 3); the caller-supplied
 *   `explicitNonKnowledge` option still works as before.
 * - DEAD_ACTS: M1 broke equal-`span_end` ties in the same commit by
 *   insertion order. M1.1 DEPARTS from that (approved): contradictory
 *   ties become `uncertain` (`conflicting_life_state_same_point`),
 *   and a resurrection event that casts the character as actor is
 *   cleared by the own-event exception (`cleared_by:
 *   own_event_resurrection`, recorded as a run note, not a finding).
 */
import type {
  CharacterFactEntry,
  EventEntry,
  FindingEvidence,
  KnowledgeDenial,
  KnowledgeEntry,
} from "../state/types";
import {
  characterName,
  eventParticipants,
  findEvent,
  type ProjectedState,
} from "../state/projections";

export type RuleCode =
  | "DEAD_ACTS"
  | "KNOWLEDGE_LEAK"
  | "TWO_PLACES"
  | "PROMISE_OVERDUE"
  | "LOCATION_TELEPORT";

export interface CheckerFinding {
  ruleCode: RuleCode;
  confidence: "confirmed" | "uncertain";
  description: string;
  /** Machine-readable reason for `uncertain` findings (null when confirmed). */
  reason: string | null;
  /** Ledger entry ids the finding is about (used to de-duplicate runs). */
  subjects: string[];
  evidence: FindingEvidence[];
}

/**
 * A note recorded on a checker run (M1.1 item 4a). Not a finding: it
 * explains why a would-be finding was cleared — here, that a
 * resurrection event was cleared by the own-event exception.
 */
export interface CheckerNote {
  type: "own_event_resurrection";
  factId: string;
  eventId: string;
  characterId: string;
  description: string;
}

export interface CheckerRunResult {
  findings: CheckerFinding[];
  notes: CheckerNote[];
}

export interface CheckerOptions {
  /** Proposition ids declared closed-world (spec 7; fixture declarations). */
  closedWorldPropositionIds?: Set<string>;
  /**
   * Explicit evidenced records of non-knowledge, as
   * `${characterId}:${propositionId}` pairs. The spec names this as a
   * confirmed-basis but defines no ledger representation for it; M1
   * accepts it only as a caller-supplied checker input.
   */
  explicitNonKnowledge?: Set<string>;
  /**
   * LOCATION_TELEPORT only: whether two locations count as "distant".
   * Required — without it the rule yields no findings.
   */
  isDistant?: (a: string, b: string) => boolean;
}

function stateEvidence(event: EventEntry): FindingEvidence[] {
  return event.evidence.map((s) => ({
    role: "state",
    quote: s.quote,
    startOffset: s.startOffset,
    endOffset: s.endOffset,
    chapterRevisionId: s.chapterRevisionId,
  }));
}

function textEvidence(event: EventEntry): FindingEvidence[] {
  return event.evidence.map((s) => ({
    role: "text",
    quote: s.quote,
    startOffset: s.startOffset,
    endOffset: s.endOffset,
    chapterRevisionId: s.chapterRevisionId,
  }));
}

interface LifeState {
  fact: CharacterFactEntry;
  kind: "alive" | "dead";
  validFromEvent: EventEntry;
}

type LifeStateSelection =
  | { outcome: "none" }
  | { outcome: "alive" | "dead"; fact: CharacterFactEntry; validFromEvent: EventEntry }
  | {
      outcome: "conflict";
      deadFact: CharacterFactEntry;
      aliveFact: CharacterFactEntry;
      deadEvent: EventEntry;
      aliveEvent: EventEntry;
    };

/**
 * The latest applicable life-state for a character before a story point:
 * the most recent asserted `alive`/`dead` fact whose event is current,
 * asserted, real, and ends strictly before `beforeSpanStart` (spec 7).
 * The historical death fact is never retracted by a later resurrection;
 * selection picks the most recent fact, so a resurrection (new `alive`
 * fact) supersedes it.
 *
 * M1.1 item 4b (approved departure from the spec SQL): when the top
 * candidates share the same `span_end` AND the same `commit_seq` and
 * disagree on kind, no winner is chosen — the selection is a
 * `conflict`, and the caller must emit an `uncertain` finding instead
 * of silently picking one. Different `commit_seq` keeps the spec rule
 * (higher wins); ties within one kind need no choice.
 */
function selectLifeState(
  state: ProjectedState,
  characterId: string,
  beforeSpanStart: number,
): LifeStateSelection {
  const seqByCommit = new Map(state.commits.map((c) => [c.id, c.commitSeq] as [string, number]));
  const candidates: Array<LifeState & { spanEnd: number; seq: number; index: number }> = [];
  state.characterFacts.forEach((fact, index) => {
    if (fact.characterId !== characterId) return;
    if (fact.kind !== "alive" && fact.kind !== "dead") return;
    const validFromEvent = findEvent(state, fact.validFromEventId);
    if (!validFromEvent) return;
    if (validFromEvent.certainty !== "asserted" || validFromEvent.realityScope !== "real") return;
    if (validFromEvent.spanEnd === null || validFromEvent.spanEnd >= beforeSpanStart) return;
    candidates.push({
      fact,
      kind: fact.kind,
      validFromEvent,
      spanEnd: validFromEvent.spanEnd,
      seq: seqByCommit.get(fact.commitId) ?? 0,
      index,
    });
  });
  if (candidates.length === 0) return { outcome: "none" };
  const maxSpanEnd = Math.max(...candidates.map((c) => c.spanEnd));
  const maxSeq = Math.max(...candidates.filter((c) => c.spanEnd === maxSpanEnd).map((c) => c.seq));
  const tier = candidates
    .filter((c) => c.spanEnd === maxSpanEnd && c.seq === maxSeq)
    .sort((a, b) => b.index - a.index);
  const kinds = new Set(tier.map((c) => c.kind));
  if (kinds.has("alive") && kinds.has("dead")) {
    const dead = tier.find((c) => c.kind === "dead") as LifeState & { spanEnd: number; seq: number; index: number };
    const alive = tier.find((c) => c.kind === "alive") as LifeState & { spanEnd: number; seq: number; index: number };
    return {
      outcome: "conflict",
      deadFact: dead.fact,
      aliveFact: alive.fact,
      deadEvent: dead.validFromEvent,
      aliveEvent: alive.validFromEvent,
    };
  }
  const winner = tier[0];
  return { outcome: winner.kind, fact: winner.fact, validFromEvent: winner.validFromEvent };
}

export function checkDeadActs(
  state: ProjectedState,
  notes: CheckerNote[] = [],
): CheckerFinding[] {
  const findings: CheckerFinding[] = [];
  for (const act of state.events) {
    if (act.spanStart === null) continue;
    const actors = eventParticipants(state, act.id).filter(
      (p) => p.role === "actor" || p.role === "speaker",
    );
    for (const actor of actors) {
      const name = characterName(state, actor.characterId);
      const selection = selectLifeState(state, actor.characterId, act.spanStart);
      if (selection.outcome === "none" || selection.outcome === "alive") continue;
      if (selection.outcome === "conflict") {
        // M1.1 item 4b: contradictory life-state at the same story
        // point — uncertain, never silently cleared, never confirmed.
        findings.push({
          ruleCode: "DEAD_ACTS",
          confidence: "uncertain",
          reason: "conflicting_life_state_same_point",
          description:
            `${name} acts in "${act.summary}" but the latest life-state at this story point is ` +
            `contradictory: one record says dead ("${selection.deadEvent.summary}"), ` +
            `another says alive ("${selection.aliveEvent.summary}").`,
          subjects: [act.id, selection.deadFact.id, selection.aliveFact.id],
          evidence: [
            ...stateEvidence(selection.deadEvent),
            ...stateEvidence(selection.aliveEvent),
            ...textEvidence(act),
          ],
        });
        continue;
      }
      // selection.outcome === "dead"
      const life = selection;
      // M1.1 item 4a (approved departure from the spec SQL): the event
      // that creates an `alive` fact is that fact's "own event" — an
      // asserted, real acting event that raises its own alive fact
      // clears itself. Applies only to `alive` facts, never `dead`.
      if (act.certainty === "asserted" && act.realityScope === "real") {
        const ownAlive = state.characterFacts.find(
          (f) =>
            f.kind === "alive" &&
            f.characterId === actor.characterId &&
            f.validFromEventId === act.id,
        );
        if (ownAlive) {
          notes.push({
            type: "own_event_resurrection",
            factId: ownAlive.id,
            eventId: act.id,
            characterId: actor.characterId,
            description:
              `${name}'s act in "${act.summary}" would be flagged (latest life-state before it is dead), ` +
              `but the act itself raises an alive fact, so it is cleared by the own-event exception.`,
          });
          continue;
        }
      }
      const clean = act.certainty === "asserted" && act.realityScope === "real";
      findings.push({
        ruleCode: "DEAD_ACTS",
        confidence: clean ? "confirmed" : "uncertain",
        reason: clean ? null : act.realityScope !== "real" ? "non_real_action" : "ambiguous_action",
        description:
          `${name} acts in "${act.summary}" after dying in "${life.validFromEvent.summary}". ` +
          `Latest applicable life-state before this event is dead.`,
        subjects: [act.id, life.fact.id, life.validFromEvent.id],
        evidence: [...stateEvidence(life.validFromEvent), ...textEvidence(act)],
      });
    }
  }
  return findings;
}

interface LearnAssessment {
  /** A real, asserted learn event, or a reviewer-marked `learned_in_story` entry. */
  clean: boolean;
  /** Qualifying learn entries whose learn event is non-asserted or non-real and unmarked. */
  tainted: Array<{ entry: KnowledgeEntry; learnEvent: EventEntry }>;
}

/**
 * M1.1 item 6 (approved departure from the literal spec SQL): the
 * knowledge-entry lookup itself is unchanged (a current entry counts
 * as having a belief), but a learn event that is non-asserted or
 * non-real does not cleanly clear a would-be leak — it is `tainted`
 * unless the reviewer marked the entry `learned_in_story` with
 * evidence. A real, asserted learn event (or a marked entry) is
 * `clean`.
 */
function assessLearning(
  state: ProjectedState,
  characterId: string,
  propositionId: string,
  useSpanStart: number,
): LearnAssessment {
  let clean = false;
  const tainted: Array<{ entry: KnowledgeEntry; learnEvent: EventEntry }> = [];
  for (const entry of state.knowledge) {
    if (entry.characterId !== characterId || entry.propositionId !== propositionId) continue;
    const learnEvent = findEvent(state, entry.learnedAtEventId);
    if (!learnEvent || learnEvent.spanEnd === null) continue;
    const inTime =
      learnEvent.spanEnd < useSpanStart ||
      (entry.learnedHow === "witnessed" && learnEvent.spanEnd === useSpanStart);
    if (!inTime) continue;
    const realAsserted =
      learnEvent.certainty === "asserted" && learnEvent.realityScope === "real";
    if (realAsserted || entry.learnedInStory) {
      clean = true;
    } else {
      tainted.push({ entry, learnEvent });
    }
  }
  return { clean, tainted };
}

/**
 * M1.1 item 3: an explicit `knowledge_denial` confirms a leak when the
 * denial is stated at an event at or before the use (spanEnd <= use
 * start). No filter is applied to the denial event's certainty or
 * reality scope — the proposal does not decide whether the denial's
 * stated-at event must be asserted/real, so the literal reading is
 * used and the question is recorded in docs/storyworld.md.
 *
 * A later clean learning (real + asserted, or reviewer-marked
 * `learned_in_story`) is already handled before this runs: it clears
 * the leak in `assessLearning`, so it never reaches here. A tainted
 * (non-real) learning after the denial is reported as the item-6
 * `uncertain` instead, not as a clean pass.
 */
function findConfirmingDenial(
  state: ProjectedState,
  characterId: string,
  propositionId: string,
  useSpanStart: number,
): KnowledgeDenial | null {
  const candidates = state.knowledgeDenials
    .filter((d) => d.characterId === characterId && d.propositionId === propositionId)
    .map((d) => ({ denial: d, event: findEvent(state, d.statedAtEventId) }))
    .filter(
      (x): x is { denial: KnowledgeDenial; event: EventEntry & { spanEnd: number } } =>
        x.event !== undefined && x.event.spanEnd !== null && x.event.spanEnd <= useSpanStart,
    )
    .sort((a, b) => a.event.spanEnd - b.event.spanEnd);
  return candidates.length > 0 ? candidates[0].denial : null;
}

export function checkKnowledgeLeak(
  state: ProjectedState,
  options: CheckerOptions = {},
): CheckerFinding[] {
  const findings: CheckerFinding[] = [];
  const closedWorld = options.closedWorldPropositionIds ?? new Set<string>();
  const nonKnowledge = options.explicitNonKnowledge ?? new Set<string>();

  for (const use of state.knowledgeUses) {
    const useEvent = findEvent(state, use.eventId);
    if (!useEvent) continue;
    if (useEvent.certainty !== "asserted" || useEvent.realityScope !== "real") continue;
    const useStart = useEvent.spanStart;
    if (useStart === null) {
      // Companion case (spec 7): unknown use time can never be confirmed.
      findings.push({
        ruleCode: "KNOWLEDGE_LEAK",
        confidence: "uncertain",
        reason: "unknown_use_time",
        description:
          `${characterName(state, use.characterId)} uses a proposition in "${useEvent.summary}" ` +
          `at an unknown story time, so learning order cannot be checked.`,
        subjects: [use.eventId, use.characterId, use.propositionId],
        evidence: textEvidence(useEvent),
      });
      continue;
    }
    const assessment = assessLearning(state, use.characterId, use.propositionId, useStart);
    if (assessment.clean) continue;
    if (assessment.tainted.length > 0) {
      // M1.1 item 6: the only recorded learning happened inside a
      // non-asserted or non-real event and the reviewer has not marked
      // it learned_in_story — do not clear the leak as a clean pass.
      // Cite the earliest tainted learn event and its evidence quote.
      const tainted = [...assessment.tainted].sort(
        (a, b) => (a.learnEvent.spanEnd as number) - (b.learnEvent.spanEnd as number),
      )[0];
      findings.push({
        ruleCode: "KNOWLEDGE_LEAK",
        confidence: "uncertain",
        reason: "learned_only_in_non_real_event",
        description:
          `${characterName(state, use.characterId)} uses a proposition in "${useEvent.summary}" ` +
          `and the only recorded learning is inside "${tainted.learnEvent.summary}", ` +
          `which is ${tainted.learnEvent.realityScope === "real" ? "not asserted" : `a ${tainted.learnEvent.realityScope}`} event — ` +
          `a reviewer must decide whether the learning counted in-story.`,
        subjects: [use.eventId, use.characterId, use.propositionId, tainted.learnEvent.id],
        evidence: [...stateEvidence(tainted.learnEvent), ...textEvidence(useEvent)],
      });
      continue;
    }

    const denial = findConfirmingDenial(state, use.characterId, use.propositionId, useStart);
    const confirmed =
      closedWorld.has(use.propositionId) ||
      nonKnowledge.has(`${use.characterId}:${use.propositionId}`) ||
      denial !== null;
    // State side: the denial's evidence when the denial confirms the
    // leak; otherwise the earliest recorded learning of this
    // proposition (who did learn it) — empty when nobody is recorded
    // as knowing it.
    const stateSide: FindingEvidence[] = [];
    if (denial) {
      stateSide.push(
        ...denial.evidence.map((s) => ({
          role: "state" as const,
          quote: s.quote,
          startOffset: s.startOffset,
          endOffset: s.endOffset,
          chapterRevisionId: s.chapterRevisionId,
        })),
      );
    } else {
      const learnEntries = state.knowledge
        .filter((k) => k.propositionId === use.propositionId)
        .map((k) => ({ entry: k, event: findEvent(state, k.learnedAtEventId) }))
        .filter((x) => x.event !== undefined && x.event.spanEnd !== null)
        .sort((a, b) => (a.event as EventEntry).spanEnd as number - ((b.event as EventEntry).spanEnd as number));
      if (learnEntries.length > 0) {
        stateSide.push(...stateEvidence(learnEntries[0].event as EventEntry));
      }
    }
    const subjects = [use.eventId, use.characterId, use.propositionId];
    if (denial) subjects.push(denial.id);
    findings.push({
      ruleCode: "KNOWLEDGE_LEAK",
      confidence: confirmed ? "confirmed" : "uncertain",
      reason: confirmed ? null : "open_world",
      description: denial
        ? `${characterName(state, use.characterId)} uses a proposition in "${useEvent.summary}" ` +
          `after the text states ${characterName(state, use.characterId)} does not know it, ` +
          `with no recorded learning in between.`
        : `${characterName(state, use.characterId)} uses a proposition in "${useEvent.summary}" ` +
          `without a recorded knowledge entry learned earlier` +
          (confirmed ? "." : " (open world: the record may be incomplete)."),
      subjects,
      evidence: [...stateSide, ...textEvidence(useEvent)],
    });
  }
  return findings;
}

type LocatedEvent = EventEntry & { location: string; spanStart: number; spanEnd: number };

function isLocated(event: EventEntry): event is LocatedEvent {
  return (
    event.certainty === "asserted" &&
    event.realityScope === "real" &&
    event.location !== null &&
    event.spanStart !== null &&
    event.spanEnd !== null
  );
}

export function checkTwoPlaces(state: ProjectedState): CheckerFinding[] {
  const findings: CheckerFinding[] = [];
  const located = state.events.filter(isLocated).sort(
    (a, b) => a.spanStart - b.spanStart || a.spanEnd - b.spanEnd || (a.id < b.id ? -1 : 1),
  );
  for (let i = 0; i < located.length; i += 1) {
    for (let j = i + 1; j < located.length; j += 1) {
      const a = located[i];
      const b = located[j];
      if (a.location === b.location) continue;
      // M1.1 item 5 (approved departure from the literal spec formula):
      // the overlap is classified by how it arises. Positive-length
      // intersection, a point strictly inside the other interval, or
      // two point events at the same instant are confirmed. A single
      // shared endpoint (two intervals touching, or a point on an
      // endpoint) is uncertain (`touching_interval`).
      const lo = Math.max(a.spanStart, b.spanStart);
      const hi = Math.min(a.spanEnd, b.spanEnd);
      if (lo > hi) continue; // No overlap at all.
      const aIsPoint = a.spanStart === a.spanEnd;
      const bIsPoint = b.spanStart === b.spanEnd;
      let touching = false;
      if (lo < hi) {
        // Positive-length intersection: confirmed.
      } else if (aIsPoint && bIsPoint) {
        // Two point events at the same instant: confirmed.
      } else if (aIsPoint && b.spanStart < lo && lo < b.spanEnd) {
        // Point strictly inside the other interval: confirmed.
      } else if (bIsPoint && a.spanStart < lo && lo < a.spanEnd) {
        // Point strictly inside the other interval: confirmed.
      } else {
        touching = true;
      }
      const charsA = new Set(eventParticipants(state, a.id).map((p) => p.characterId));
      const charsB = eventParticipants(state, b.id).map((p) => p.characterId);
      for (const characterId of charsB) {
        if (!charsA.has(characterId)) continue;
        findings.push({
          ruleCode: "TWO_PLACES",
          confidence: touching ? "uncertain" : "confirmed",
          reason: touching ? "touching_interval" : null,
          description:
            `${characterName(state, characterId)} is at "${a.location}" in "${a.summary}" ` +
            `and at "${b.location}" in "${b.summary}" during overlapping story intervals` +
            (touching ? " (the intervals only touch at one shared endpoint)." : "."),
          subjects: [a.id, b.id, characterId],
          evidence: [...stateEvidence(a), ...textEvidence(b)],
        });
      }
    }
  }
  return findings;
}

export function checkPromiseOverdue(state: ProjectedState): CheckerFinding[] {
  const findings: CheckerFinding[] = [];
  if (state.maxStoryEnd === null) return findings;
  for (const promise of state.promises) {
    if (promise.currentStatus !== "open") continue;
    if (promise.deadlineEventId === null) continue;
    const deadline = findEvent(state, promise.deadlineEventId);
    if (!deadline || deadline.spanEnd === null) continue;
    if (deadline.spanEnd < state.maxStoryEnd) {
      findings.push({
        ruleCode: "PROMISE_OVERDUE",
        confidence: "confirmed",
        reason: null,
        description:
          `Promise "${promise.description}" is still open after its deadline event ` +
          `"${deadline.summary}" (story order ${deadline.spanEnd}); latest committed story order is ${state.maxStoryEnd}.`,
        subjects: [promise.id, deadline.id],
        evidence: [
          ...promise.evidence.map((s) => ({
            role: "state" as const,
            quote: s.quote,
            startOffset: s.startOffset,
            endOffset: s.endOffset,
            chapterRevisionId: s.chapterRevisionId,
          })),
          ...textEvidence(deadline),
        ],
      });
    }
  }
  return findings;
}

export function checkLocationTeleport(
  state: ProjectedState,
  options: CheckerOptions = {},
): CheckerFinding[] {
  // OPEN QUESTION: "distant" has no definition in the spec. Without a
  // caller-supplied predicate the rule yields no findings.
  const isDistant = options.isDistant;
  if (!isDistant) return [];

  const findings: CheckerFinding[] = [];
  const byCharacter = new Map<string, Map<string, EventEntry>>();
  for (const event of state.events) {
    if (event.certainty !== "asserted" || event.realityScope !== "real") continue;
    if (event.spanStart === null) continue;
    for (const part of eventParticipants(state, event.id)) {
      let perChar = byCharacter.get(part.characterId);
      if (!perChar) {
        perChar = new Map<string, EventEntry>();
        byCharacter.set(part.characterId, perChar);
      }
      perChar.set(event.id, event);
    }
  }

  for (const [characterId, eventsById] of byCharacter) {
    const all = [...eventsById.values()];
    const located = all
      .filter((e) => e.location !== null)
      .sort((a, b) => {
        const aStart = a.spanStart as number;
        const bStart = b.spanStart as number;
        const aEnd = a.spanEnd ?? aStart;
        const bEnd = b.spanEnd ?? bStart;
        return aStart - bStart || aEnd - bEnd || (a.id < b.id ? -1 : 1);
      });
    for (let i = 0; i + 1 < located.length; i += 1) {
      const prev = located[i];
      const next = located[i + 1];
      if (prev.location === next.location) continue;
      if (!isDistant(prev.location as string, next.location as string)) continue;
      const moved = all.some(
        (m) =>
          m.kind === "movement" &&
          m.id !== prev.id &&
          m.id !== next.id &&
          m.spanStart !== null &&
          (prev.spanStart as number) < m.spanStart &&
          m.spanStart < (next.spanStart as number),
      );
      if (moved) continue;
      findings.push({
        ruleCode: "LOCATION_TELEPORT",
        confidence: "uncertain",
        reason: "no_intervening_movement",
        description:
          `${characterName(state, characterId)} is at "${prev.location}" in "${prev.summary}" ` +
          `and then at "${next.location}" in "${next.summary}" with no intervening movement event. ` +
          `Omitted travel is not a contradiction.`,
        subjects: [prev.id, next.id, characterId],
        evidence: [...stateEvidence(prev), ...textEvidence(next)],
      });
    }
  }
  return findings;
}

/** All five rules, in spec order. Notes (M1.1 item 4a) are collected alongside. */
export function runAllChecks(state: ProjectedState, options: CheckerOptions = {}): CheckerRunResult {
  const notes: CheckerNote[] = [];
  return {
    findings: [
      ...checkDeadActs(state, notes),
      ...checkKnowledgeLeak(state, options),
      ...checkTwoPlaces(state),
      ...checkPromiseOverdue(state),
      ...checkLocationTeleport(state, options),
    ],
    notes,
  };
}
