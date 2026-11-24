/**
 * Projections (M1) — spec section 2.
 *
 * Pure functions equivalent to the SQL views `v_current_events`,
 * `v_current_character_facts`, `v_current_knowledge` and
 * `v_current_promises`, derived from accepted commits only. Retracted
 * entries are filtered out. A promise's current status comes from its
 * latest resolution row (ordered by `commit_seq`), defaulting to `open`.
 * The checker and writer read projections only, never the raw ledger.
 */
import type {
  Character,
  CharacterFactEntry,
  Commit,
  EventEntry,
  EventParticipant,
  KnowledgeDenial,
  KnowledgeEntry,
  KnowledgeUse,
  PromiseEntry,
  PromiseStatus,
  Proposition,
  PropositionModality,
} from "./types";
import type { LedgerSnapshot } from "./repository";

export interface ProjectedPromise extends PromiseEntry {
  currentStatus: PromiseStatus;
}

export interface ProjectedState {
  branchId: string;
  headCommitId: string | null;
  headCommitSeq: number | null;
  commits: Commit[];
  characters: Character[];
  propositions: Proposition[];
  /** Current events (retracted entries excluded). */
  events: EventEntry[];
  /** Participants of current events only. */
  participants: EventParticipant[];
  /** Current knowledge entries. */
  knowledge: KnowledgeEntry[];
  /** Knowledge uses whose event is current. */
  knowledgeUses: KnowledgeUse[];
  /** Current explicit records of non-knowledge (M1.1 item 3). */
  knowledgeDenials: KnowledgeDenial[];
  /** Current character facts. */
  characterFacts: CharacterFactEntry[];
  /** Current promises with their computed status. */
  promises: ProjectedPromise[];
  /** Max `span_end` over current events (nulls ignored); null when none. */
  maxStoryEnd: number | null;
}

function retractedIds(snapshot: LedgerSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const r of snapshot.retractions) ids.add(`${r.entryTable}:${r.entryId}`);
  return ids;
}

/**
 * Derive the projected (current) state from a ledger snapshot.
 * Pure: no I/O, no mutation of the snapshot.
 */
export function projectState(snapshot: LedgerSnapshot): ProjectedState {
  const retracted = retractedIds(snapshot);
  const isRetracted = (table: string, id: string): boolean => retracted.has(`${table}:${id}`);

  const commits = snapshot.commits;
  const seqByCommit = new Map(commits.map((c) => [c.id, c.commitSeq] as [string, number]));
  const headCommitSeq =
    snapshot.headCommitId !== null ? (seqByCommit.get(snapshot.headCommitId) ?? null) : null;

  const events = snapshot.events.filter((e) => !isRetracted("event", e.id));
  const eventIds = new Set(events.map((e) => e.id));

  const promises: ProjectedPromise[] = snapshot.promises
    .filter((p) => !isRetracted("promise", p.id))
    .map((p) => {
      // M1.1 item 2: retracted resolutions do not count (retracting a
      // resolution returns the status to the previous one, or `open`).
      // Latest resolution wins by `commit_seq`; two resolutions in the
      // same commit resolve by insertion order (later inserted wins).
      const resolutions = snapshot.promiseResolutions
        .filter((r) => r.promiseId === p.id && !isRetracted("promise_resolution", r.id))
        .map((r, index) => ({ r, index }))
        .sort((a, b) => {
          const seqA = seqByCommit.get(a.r.commitId) ?? 0;
          const seqB = seqByCommit.get(b.r.commitId) ?? 0;
          return seqB - seqA || b.index - a.index;
        });
      return {
        ...p,
        currentStatus: (resolutions.length > 0 ? resolutions[0].r.status : "open") as PromiseStatus,
      };
    });

  let maxStoryEnd: number | null = null;
  for (const e of events) {
    if (e.spanEnd !== null && (maxStoryEnd === null || e.spanEnd > maxStoryEnd)) {
      maxStoryEnd = e.spanEnd;
    }
  }

  return {
    branchId: snapshot.branchId,
    headCommitId: snapshot.headCommitId,
    headCommitSeq,
    commits,
    characters: snapshot.characters,
    propositions: snapshot.propositions.filter((p) => !isRetracted("proposition", p.id)),
    events,
    participants: snapshot.participants.filter((p) => eventIds.has(p.eventId)),
    knowledge: snapshot.knowledge.filter((k) => !isRetracted("knowledge", k.id)),
    knowledgeUses: snapshot.knowledgeUses.filter((u) => eventIds.has(u.eventId)),
    knowledgeDenials: snapshot.knowledgeDenials.filter((d) => !isRetracted("knowledge_denial", d.id)),
    characterFacts: snapshot.characterFacts.filter((f) => !isRetracted("character_fact", f.id)),
    promises,
    maxStoryEnd,
  };
}

/** Look up an event in projected state by id (current events only). */
/** A proposition's effective modality; a row without one is a legacy asserted fact. */
export function propositionModality(p: Proposition): PropositionModality {
  return p.modality ?? "asserted";
}

/** World facts only: promised/intended/reported/hypothetical propositions are excluded. */
export function assertedPropositions(state: ProjectedState): Proposition[] {
  return state.propositions.filter((p) => propositionModality(p) === "asserted");
}

export function findEvent(state: ProjectedState, eventId: string): EventEntry | undefined {
  return state.events.find((e) => e.id === eventId);
}

/** All participants of one event, from projected state. */
export function eventParticipants(state: ProjectedState, eventId: string): EventParticipant[] {
  return state.participants.filter((p) => p.eventId === eventId);
}

/** Character display name (canonical name), or the raw id when unknown. */
export function characterName(state: ProjectedState, characterId: string): string {
  return state.characters.find((c) => c.id === characterId)?.canonicalName ?? characterId;
}
