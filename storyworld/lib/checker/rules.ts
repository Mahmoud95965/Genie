/**
 * Deterministic rule checker (M1) — spec section 7. Pure functions, no LLM.
 *
 * Runs over projected state (see `../state/projections`). Every finding
 * carries confidence and dual evidence where applicable.
 *
 * Honesty requirement (spec section 7): the checker covers only
 * explicitly represented rules over correctly extracted state.
 * Extraction errors compound. A clean run is not proof of consistency.
 *
 * Documented readings / open questions (see also the M1 report):
 * - LOCATION_TELEPORT: "distant" has no definition in the spec — there
 *   is no location or distance model anywhere. The rule is implemented
 *   with a caller-supplied `isDistant` predicate; without one it yields
 *   no findings (marked unconfigured). This is an open question, not a
 *   silent choice.
 * - TWO_PLACES: the overlap formula uses `<=`, so intervals sharing one
 *   endpoint count as overlapping. Followed literally.
 * - KNOWLEDGE_LEAK: the spec SQL does not filter the learn event by
 *   certainty/reality_scope; followed literally (only span order and
 *   channel conditions matter). An "explicit evidenced record of
 *   non-knowledge" has no ledger representation in the spec; M1 accepts
 *   it only as a checker option (`explicitNonKnowledge`), not as stored
 *   state. Also an open question.
 * - DEAD_ACTS: ties between two life-state facts with equal `span_end`
 *   in the same commit are unspecified by the spec SQL (it orders by
 *   `span_end desc, commit_seq desc`); M1 breaks them by insertion order
 *   (later inserted wins).
 */
import type { CharacterFactEntry, EventEntry, FindingEvidence } from "../state/types";
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

/**
 * The latest applicable life-state for a character before a story point:
 * the most recent asserted `alive`/`dead` fact whose event is current,
 * asserted, real, and ends strictly before `beforeSpanStart` (spec 7).
 * The historical death fact is never retracted by a later resurrection;
 * selection picks the most recent fact, so a resurrection (new `alive`
 * fact) supersedes it.
 */
function latestLifeState(
  state: ProjectedState,
  characterId: string,
  beforeSpanStart: number,
): LifeState | null {
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
  candidates.sort((a, b) => b.spanEnd - a.spanEnd || b.seq - a.seq || b.index - a.index);
  return candidates.length > 0 ? candidates[0] : null;
}

export function checkDeadActs(state: ProjectedState): CheckerFinding[] {
  const findings: CheckerFinding[] = [];
  for (const act of state.events) {
    if (act.spanStart === null) continue;
    const actors = eventParticipants(state, act.id).filter(
      (p) => p.role === "actor" || p.role === "speaker",
    );
    for (const actor of actors) {
      const life = latestLifeState(state, actor.characterId, act.spanStart);
      if (!life || life.kind !== "dead") continue;
      const clean = act.certainty === "asserted" && act.realityScope === "real";
      const name = characterName(state, actor.characterId);
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

function knowledgeQualifies(
  state: ProjectedState,
  characterId: string,
  propositionId: string,
  useSpanStart: number,
): boolean {
  for (const entry of state.knowledge) {
    if (entry.characterId !== characterId || entry.propositionId !== propositionId) continue;
    const learnEvent = findEvent(state, entry.learnedAtEventId);
    if (!learnEvent || learnEvent.spanEnd === null) continue;
    if (learnEvent.spanEnd < useSpanStart) return true;
    if (entry.learnedHow === "witnessed" && learnEvent.spanEnd === useSpanStart) return true;
  }
  return false;
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
    if (knowledgeQualifies(state, use.characterId, use.propositionId, useStart)) continue;

    const confirmed =
      closedWorld.has(use.propositionId) ||
      nonKnowledge.has(`${use.characterId}:${use.propositionId}`);
    // State side: the earliest recorded learning of this proposition
    // (who did learn it) — empty when nobody is recorded as knowing it.
    const stateSide: FindingEvidence[] = [];
    const learnEntries = state.knowledge
      .filter((k) => k.propositionId === use.propositionId)
      .map((k) => ({ entry: k, event: findEvent(state, k.learnedAtEventId) }))
      .filter((x) => x.event !== undefined && x.event.spanEnd !== null)
      .sort((a, b) => (a.event as EventEntry).spanEnd as number - ((b.event as EventEntry).spanEnd as number));
    if (learnEntries.length > 0) {
      stateSide.push(...stateEvidence(learnEntries[0].event as EventEntry));
    }
    findings.push({
      ruleCode: "KNOWLEDGE_LEAK",
      confidence: confirmed ? "confirmed" : "uncertain",
      reason: confirmed ? null : "open_world",
      description:
        `${characterName(state, use.characterId)} uses a proposition in "${useEvent.summary}" ` +
        `without a recorded knowledge entry learned earlier` +
        (confirmed ? "." : " (open world: the record may be incomplete)."),
      subjects: [use.eventId, use.characterId, use.propositionId],
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
      // Interval overlap, all bounds known (spec 7 formula, literal).
      if (!(a.spanStart <= b.spanEnd && b.spanStart <= a.spanEnd)) continue;
      const charsA = new Set(eventParticipants(state, a.id).map((p) => p.characterId));
      const charsB = eventParticipants(state, b.id).map((p) => p.characterId);
      for (const characterId of charsB) {
        if (!charsA.has(characterId)) continue;
        findings.push({
          ruleCode: "TWO_PLACES",
          confidence: "confirmed",
          reason: null,
          description:
            `${characterName(state, characterId)} is at "${a.location}" in "${a.summary}" ` +
            `and at "${b.location}" in "${b.summary}" during overlapping story intervals.`,
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

/** All five rules, in spec order. */
export function runAllChecks(state: ProjectedState, options: CheckerOptions = {}): CheckerFinding[] {
  return [
    ...checkDeadActs(state),
    ...checkKnowledgeLeak(state, options),
    ...checkTwoPlaces(state),
    ...checkPromiseOverdue(state),
    ...checkLocationTeleport(state, options),
  ];
}
