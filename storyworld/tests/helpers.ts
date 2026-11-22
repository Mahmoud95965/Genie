/**
 * Shared builders for M1 tests: synthetic projected states.
 *
 * These construct a `LedgerSnapshot` by hand and derive `ProjectedState`
 * from it — no repository, no network, no fixtures. Character ids are
 * stable strings so tests can refer to them by name.
 */
import { projectState, type ProjectedState } from "../lib/state/projections";
import type { LedgerSnapshot } from "../lib/state/repository";
import type {
  Character,
  CharacterFactEntry,
  Commit,
  EventEntry,
  EventParticipant,
  KnowledgeDenial,
  KnowledgeEntry,
  KnowledgeUse,
  ParticipantRole,
  PromiseEntry,
  PromiseResolution,
  Proposition,
  Retraction,
} from "../lib/state/types";

export const CHAR = {
  salim: "char-salim",
  omar: "char-omar",
  layla: "char-layla",
  karim: "char-karim",
} as const;

export function defaultCharacters(): Character[] {
  return [
    { id: CHAR.salim, projectId: "project-1", canonicalName: "سالم", aliases: [] },
    { id: CHAR.omar, projectId: "project-1", canonicalName: "عمر", aliases: [] },
    { id: CHAR.layla, projectId: "project-1", canonicalName: "ليلى", aliases: [] },
    { id: CHAR.karim, projectId: "project-1", canonicalName: "كريم", aliases: [] },
  ];
}

const DEFAULT_SPAN = {
  quote: "…",
  startOffset: 0,
  endOffset: 1,
  chapterRevisionId: "rev-1",
  bodySha256: "sha",
};

export function ev(overrides: Partial<EventEntry> & { id: string }): EventEntry {
  return {
    branchId: "branch-1",
    commitId: "commit-1",
    chapterRevisionId: "rev-1",
    kind: "action",
    summary: "event",
    location: null,
    storyTime: null,
    spanStart: null,
    spanEnd: null,
    realityScope: "real",
    certainty: "asserted",
    evidence: [{ ...DEFAULT_SPAN, quote: overrides.summary ?? "event" }],
    ...overrides,
  };
}

export function fact(overrides: Partial<CharacterFactEntry> & { id: string }): CharacterFactEntry {
  return {
    branchId: "branch-1",
    commitId: "commit-1",
    characterId: CHAR.salim,
    kind: "dead",
    value: "ميت",
    validFromEventId: "e-death",
    evidence: [{ ...DEFAULT_SPAN }],
    ...overrides,
  };
}

export function know(overrides: Partial<KnowledgeEntry> & { id: string }): KnowledgeEntry {
  return {
    branchId: "branch-1",
    commitId: "commit-1",
    characterId: CHAR.layla,
    propositionId: "prop-1",
    learnedAtEventId: "e-learn",
    learnedHow: "told",
    certainty: "asserted",
    learnedInStory: false,
    learnedInStoryEvidence: [],
    evidence: [{ ...DEFAULT_SPAN }],
    ...overrides,
  };
}

export function use(overrides: Partial<KnowledgeUse> & { eventId: string }): KnowledgeUse {
  return {
    branchId: "branch-1",
    characterId: CHAR.karim,
    propositionId: "prop-1",
    ...overrides,
  };
}

/** M1.1 item 3: an explicit record that a character does not know a proposition at an event. */
export function denial(overrides: Partial<KnowledgeDenial> & { id: string }): KnowledgeDenial {
  return {
    branchId: "branch-1",
    commitId: "commit-1",
    characterId: CHAR.karim,
    propositionId: "prop-1",
    statedAtEventId: "e-deny",
    evidence: [{ ...DEFAULT_SPAN }],
    ...overrides,
  };
}

export function part(
  eventId: string,
  characterId: string,
  role: ParticipantRole,
): EventParticipant {
  return { eventId, branchId: "branch-1", characterId, role };
}

export function promise(
  overrides: Partial<PromiseEntry> & { id: string },
): PromiseEntry {
  return {
    branchId: "branch-1",
    commitId: "commit-1",
    description: "promise",
    raisedAtEventId: "e-raise",
    deadlineEventId: null,
    deadlineCondition: null,
    evidence: [{ ...DEFAULT_SPAN }],
    ...overrides,
  };
}

export function resolution(
  overrides: Partial<PromiseResolution> & { id: string },
): PromiseResolution {
  return {
    branchId: "branch-1",
    commitId: "commit-1",
    promiseId: "promise-1",
    resolvedAtEventId: "e-resolve",
    status: "fulfilled",
    ...overrides,
  };
}

export function proposition(overrides: Partial<Proposition> & { id: string }): Proposition {
  return {
    branchId: "branch-1",
    statement: "proposition",
    createdInCommitId: "commit-1",
    evidence: [{ ...DEFAULT_SPAN }],
    ...overrides,
  };
}

export interface StateInput {
  events?: EventEntry[];
  participants?: EventParticipant[];
  facts?: CharacterFactEntry[];
  knowledge?: KnowledgeEntry[];
  uses?: KnowledgeUse[];
  denials?: KnowledgeDenial[];
  promises?: PromiseEntry[];
  resolutions?: PromiseResolution[];
  propositions?: Proposition[];
  retractions?: Retraction[];
  characters?: Character[];
  commits?: Commit[];
  headCommitId?: string | null;
}

export function makeState(input: StateInput = {}): ProjectedState {
  const commits: Commit[] = input.commits ?? [
    {
      id: "commit-1",
      branchId: "branch-1",
      commitSeq: 1,
      parentCommitId: null,
      author: "human",
      idempotencyKey: null,
      createdAt: "2026-11-22T00:00:00.000Z",
    },
  ];
  const snapshot: LedgerSnapshot = {
    branchId: "branch-1",
    headCommitId: input.headCommitId === undefined ? "commit-1" : input.headCommitId,
    commits,
    characters: input.characters ?? defaultCharacters(),
    chapters: [],
    chapterRevisions: [],
    chapterHeads: [],
    propositions: input.propositions ?? [],
    events: input.events ?? [],
    participants: input.participants ?? [],
    knowledge: input.knowledge ?? [],
    knowledgeUses: input.uses ?? [],
    knowledgeDenials: input.denials ?? [],
    characterFacts: input.facts ?? [],
    promises: input.promises ?? [],
    promiseResolutions: input.resolutions ?? [],
    retractions: input.retractions ?? [],
    findings: [],
  };
  return projectState(snapshot);
}
