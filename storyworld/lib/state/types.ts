/**
 * Story-World ledger entities (M1) — spec sections 2 and 3.
 *
 * TypeScript mirrors of the starter DDL rows. The ledger is append-only:
 * rows are never updated or deleted; truth changes only through
 * `Retraction` rows inserted by a later commit. Evidence spans are
 * carried inline on each entry in this in-memory model (the Postgres
 * mapping, when it comes, stores them in `evidence_spans` +
 * `entry_evidence` instead); the behaviour is identical — every entry
 * carries at least one verified quote with canonical code-point offsets.
 */

export type EventKind =
  | "death"
  | "action"
  | "dialogue"
  | "knowledge_transfer"
  | "knowledge_use"
  | "movement"
  | "observation"
  | "promise_raised"
  | "other";

export type ParticipantRole = "actor" | "victim" | "speaker" | "listener" | "observer" | "subject";

export type RealityScope = "real" | "dream" | "vision" | "unreliable_account" | "hypothetical";

export type EventCertainty = "asserted" | "ambiguous" | "false_in_world";

export type LearnedHow = "witnessed" | "told" | "inferred" | "other";

export type KnowledgeCertainty = "asserted" | "suspected" | "false_belief";

export type FactKind = "alive" | "dead" | "location" | "trait" | "relationship";

export type PromiseStatusChange = "raised" | "fulfilled" | "violated" | "abandoned";

/** A promise's current status: latest resolution, defaulting to `open`. */
export type PromiseStatus = "open" | "fulfilled" | "violated" | "abandoned";

export type EntryTable =
  | "event"
  | "knowledge"
  | "character_fact"
  | "promise"
  | "proposition"
  | "promise_resolution"
  | "knowledge_denial";

export type ChapterSource = "human" | "writer" | "repair" | "import";

export type FindingSource = "rule_checker" | "llm_reviewer" | "human";

export type FindingConfidence = "confirmed" | "uncertain";

export type FindingResolution = "open" | "accepted" | "dismissed" | "fixed";

/** A verified evidence quote, with canonical code-point offsets (spec 6.5). */
export interface VerifiedSpan {
  quote: string;
  startOffset: number;
  endOffset: number;
  chapterRevisionId: string;
  bodySha256: string;
}

/** One side of a finding's dual evidence (spec section 7). */
export interface FindingEvidence {
  role: "state" | "text";
  quote: string;
  startOffset: number;
  endOffset: number;
  chapterRevisionId: string;
}

export interface Project {
  id: string;
  title: string;
  createdAt: string;
}

export interface Branch {
  id: string;
  projectId: string;
  name: string;
  parentBranchId: string | null;
  forkCommitId: string | null;
  createdAt: string;
}

export interface Commit {
  id: string;
  branchId: string;
  commitSeq: number;
  parentCommitId: string | null;
  author: string;
  idempotencyKey: string | null;
  createdAt: string;
}

/** Characters belong to the project, not to the ledger (spec section 2). */
export interface Character {
  id: string;
  projectId: string;
  canonicalName: string;
  aliases: string[];
}

export interface Chapter {
  id: string;
  branchId: string;
  seq: number;
  title: string | null;
}

export interface ChapterRevision {
  id: string;
  chapterId: string;
  branchId: string;
  revisionNo: number;
  bodyNormalized: string;
  bodySha256: string;
  source: ChapterSource;
  createdInCommitId: string;
  createdAt: string;
}

export interface ChapterHead {
  chapterId: string;
  branchId: string;
  activeRevisionId: string;
}

/**
 * How a proposition relates to the story world. Absent on a stored row
 * (legacy ledgers, extractor.v3 and earlier) means "asserted".
 * Only "asserted" propositions are world facts; the others are retained
 * so their knowledge links survive, but must not be read as true.
 */
export type PropositionModality = "asserted" | "promised" | "intended" | "reported" | "hypothetical";
export const PROPOSITION_MODALITY_VALUES: readonly PropositionModality[] = ["asserted", "promised", "intended", "reported", "hypothetical"];

export interface Proposition {
  id: string;
  modality?: PropositionModality;
  branchId: string;
  statement: string;
  createdInCommitId: string;
  evidence: VerifiedSpan[];
}

export interface EventEntry {
  id: string;
  branchId: string;
  commitId: string;
  chapterRevisionId: string;
  kind: EventKind;
  summary: string;
  location: string | null;
  storyTime: string | null;
  spanStart: number | null;
  spanEnd: number | null;
  realityScope: RealityScope;
  certainty: EventCertainty;
  evidence: VerifiedSpan[];
}

export interface EventParticipant {
  eventId: string;
  branchId: string;
  characterId: string;
  role: ParticipantRole;
}

export interface KnowledgeEntry {
  id: string;
  branchId: string;
  commitId: string;
  characterId: string;
  propositionId: string;
  learnedAtEventId: string;
  learnedHow: LearnedHow;
  certainty: KnowledgeCertainty;
  /**
   * M1.1 item 6 (in-memory only; SQL and extractor schema unchanged):
   * reviewer mark that the character retained the knowledge in-story
   * even though the learn event itself was non-asserted or non-real
   * (e.g. a prophetic dream they later act on). With the mark, the
   * learn event counts as normal and clears a would-be
   * KNOWLEDGE_LEAK. `learnedInStoryEvidence` is the quote showing the
   * character retains or refers to what they learned. This is reviewer
   * workflow annotation (like `Finding.resolution`), not world truth:
   * it is set via `markKnowledgeLearnedInStory`, never by the
   * extractor, and does not change the ledger's append-only rows.
   */
  learnedInStory: boolean;
  learnedInStoryEvidence: VerifiedSpan[];
  evidence: VerifiedSpan[];
}

export interface KnowledgeUse {
  eventId: string;
  branchId: string;
  characterId: string;
  propositionId: string;
}

/**
 * M1.1 item 3 (in-memory only; SQL and extractor schema unchanged):
 * an explicit, evidenced record that a character does NOT know a
 * proposition at a given event — the text itself states the
 * non-knowledge. Append-only and retractable like other ledger rows.
 * It confirms a KNOWLEDGE_LEAK only for uses at or after the stated
 * event, with the use asserted, real, and time known, and with no
 * current knowledge entry learned before the use (a later clean
 * learning clears it).
 */
export interface KnowledgeDenial {
  id: string;
  branchId: string;
  commitId: string;
  characterId: string;
  propositionId: string;
  statedAtEventId: string;
  evidence: VerifiedSpan[];
}

export interface CharacterFactEntry {
  id: string;
  branchId: string;
  commitId: string;
  characterId: string;
  kind: FactKind;
  value: string;
  validFromEventId: string;
  evidence: VerifiedSpan[];
}

export interface PromiseEntry {
  id: string;
  branchId: string;
  commitId: string;
  description: string;
  raisedAtEventId: string;
  deadlineEventId: string | null;
  deadlineCondition: string | null;
  evidence: VerifiedSpan[];
}

export interface PromiseResolution {
  id: string;
  branchId: string;
  commitId: string;
  promiseId: string;
  resolvedAtEventId: string;
  status: Exclude<PromiseStatus, "open">;
}

export interface Retraction {
  id: string;
  branchId: string;
  commitId: string;
  entryTable: EntryTable;
  entryId: string;
  reason: string;
}

export interface Finding {
  id: string;
  branchId: string;
  /** The head commit the finding was raised on. */
  commitId: string;
  source: FindingSource;
  ruleCode: string | null;
  confidence: FindingConfidence;
  description: string;
  /** Optional machine-readable reason (e.g. `open_world`, `unknown_use_time`). */
  reason: string | null;
  resolution: FindingResolution;
  /**
   * Ledger entry ids the finding is about (in-memory identity used to
   * de-duplicate re-runs; the Postgres mapping derives identity from
   * `finding_evidence` instead).
   */
  subjects: string[];
  evidence: FindingEvidence[];
  createdAt: string;
}
