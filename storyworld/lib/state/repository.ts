/**
 * Story-World repository interface (M1) — spec sections 2, 3 and 9.
 *
 * The in-memory implementation lives in `memory-store.ts`; a Postgres
 * implementation can replace it behind this interface later. M1 scope:
 * one `main` branch per project, a single linear commit sequence.
 * Branching is gated until M3 (`BRANCHING_DISABLED`).
 *
 * Commit protocol (spec section 2): accepted items are inserted in one
 * atomic commit. The caller passes `expectedHead`; the store moves the
 * head only if it still equals that value, otherwise it throws
 * `HEAD_CONFLICT` and inserts nothing. Ordering uses `commit_seq`, never
 * timestamps or UUIDs.
 */
import type {
  Branch,
  Chapter,
  ChapterHead,
  ChapterRevision,
  ChapterSource,
  Character,
  Commit,
  EntryTable,
  EventEntry,
  EventKind,
  EventParticipant,
  FactKind,
  Finding,
  FindingResolution,
  KnowledgeCertainty,
  KnowledgeDenial,
  KnowledgeEntry,
  KnowledgeUse,
  LearnedHow,
  ParticipantRole,
  Project,
  PromiseEntry,
  PromiseResolution,
  Proposition,
  PropositionModality,
  Retraction,
  CharacterFactEntry,
  EventCertainty,
  FindingConfidence,
  FindingEvidence,
  FindingSource,
  PromiseStatus,
  RealityScope,
  VerifiedSpan,
} from "./types";

export class HeadConflictError extends Error {
  readonly code = "HEAD_CONFLICT";
  constructor(message: string) {
    super(message);
    this.name = "HeadConflictError";
  }
}

export class ValidationFailedError extends Error {
  readonly code = "VALIDATION_FAILED";
  readonly issues: Array<{ path: string; message: string }>;
  constructor(issues: Array<{ path: string; message: string }>) {
    super(`VALIDATION_FAILED: ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
    this.name = "ValidationFailedError";
    this.issues = issues;
  }
}

export class ScopeViolationError extends Error {
  readonly code = "SCOPE_VIOLATION";
  constructor(message: string) {
    super(message);
    this.name = "ScopeViolationError";
  }
}

export class BranchingDisabledError extends Error {
  readonly code = "BRANCHING_DISABLED";
  constructor(message = "BRANCHING_DISABLED: branching is gated until M3.") {
    super(message);
    this.name = "BranchingDisabledError";
  }
}

export class NotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ChapterSeqExistsError extends Error {
  readonly code = "CHAPTER_SEQ_EXISTS";
  constructor(message: string) {
    super(message);
    this.name = "ChapterSeqExistsError";
  }
}

/** New ledger rows accepted by `commit()`; ids are assigned by the caller. */
export interface NewProposition {
  id: string;
  /** Omitted = asserted (legacy). extractor.v4 commits always set it. */
  modality?: PropositionModality;
  statement: string;
  evidence: VerifiedSpan[];
}

export interface NewEvent {
  id: string;
  chapterRevisionId: string;
  kind: EventKind;
  summary: string;
  location: string | null;
  storyTime: string | null;
  spanStart: number | null;
  spanEnd: number | null;
  realityScope: RealityScope;
  certainty: EventCertainty;
  participants: Array<{ characterId: string; role: ParticipantRole }>;
  evidence: VerifiedSpan[];
}

export interface NewKnowledge {
  id: string;
  characterId: string;
  propositionId: string;
  learnedAtEventId: string;
  learnedHow: LearnedHow;
  certainty: KnowledgeCertainty;
  evidence: VerifiedSpan[];
  /** M1.1 item 6: reviewer mark (default false; normally set post-commit). */
  learnedInStory?: boolean;
  learnedInStoryEvidence?: VerifiedSpan[];
}

export interface NewKnowledgeUse {
  eventId: string;
  characterId: string;
  propositionId: string;
}

/** M1.1 item 3: an explicit evidenced record of non-knowledge. */
export interface NewKnowledgeDenial {
  id: string;
  characterId: string;
  propositionId: string;
  statedAtEventId: string;
  evidence: VerifiedSpan[];
}

export interface NewCharacterFact {
  id: string;
  characterId: string;
  kind: FactKind;
  value: string;
  validFromEventId: string;
  evidence: VerifiedSpan[];
}

export interface NewPromise {
  id: string;
  description: string;
  raisedAtEventId: string;
  deadlineEventId: string | null;
  deadlineCondition: string | null;
  evidence: VerifiedSpan[];
}

/** M1.1 item 2: a reviewer-chosen resolution of an existing promise. */
export interface NewPromiseResolution {
  id: string;
  promiseId: string;
  resolvedAtEventId: string;
  status: Exclude<PromiseStatus, "open">;
}

export interface RetractInput {
  entryTable: EntryTable;
  entryId: string;
  reason: string;
}

export interface CommitItems {
  propositions: NewProposition[];
  events: NewEvent[];
  knowledge: NewKnowledge[];
  knowledgeUses: NewKnowledgeUse[];
  characterFacts: NewCharacterFact[];
  promises: NewPromise[];
  /** M1.1 item 2: resolutions of already-committed promises. */
  resolutions: NewPromiseResolution[];
  /** M1.1 item 3: explicit records of non-knowledge. */
  knowledgeDenials: NewKnowledgeDenial[];
}

export function emptyCommitItems(): CommitItems {
  return {
    propositions: [],
    events: [],
    knowledge: [],
    knowledgeUses: [],
    characterFacts: [],
    promises: [],
    resolutions: [],
    knowledgeDenials: [],
  };
}

export interface CommitRequest {
  branchId: string;
  /** The head the caller saw; null when the branch has no commits yet. */
  expectedHead: string | null;
  author?: string;
  idempotencyKey?: string;
  items: CommitItems;
  retracts?: RetractInput[];
}

export interface CommitResult {
  commit: Commit;
  newHead: string;
  inserted: {
    propositions: Proposition[];
    events: EventEntry[];
    knowledge: KnowledgeEntry[];
    knowledgeUses: KnowledgeUse[];
    characterFacts: CharacterFactEntry[];
    promises: PromiseEntry[];
    resolutions: PromiseResolution[];
    knowledgeDenials: KnowledgeDenial[];
  };
  retractions: Retraction[];
}

export interface NewFinding {
  branchId: string;
  commitId: string;
  source: FindingSource;
  ruleCode: string | null;
  confidence: FindingConfidence;
  description: string;
  reason?: string | null;
  subjects: string[];
  evidence: FindingEvidence[];
}

export interface LedgerSnapshot {
  branchId: string;
  headCommitId: string | null;
  commits: Commit[];
  characters: Character[];
  chapters: Chapter[];
  chapterRevisions: ChapterRevision[];
  chapterHeads: ChapterHead[];
  propositions: Proposition[];
  events: EventEntry[];
  participants: EventParticipant[];
  knowledge: KnowledgeEntry[];
  knowledgeUses: KnowledgeUse[];
  /** M1.1 item 3: explicit records of non-knowledge. */
  knowledgeDenials: KnowledgeDenial[];
  characterFacts: CharacterFactEntry[];
  promises: PromiseEntry[];
  promiseResolutions: PromiseResolution[];
  retractions: Retraction[];
  findings: Finding[];
}

export interface StoryworldRepository {
  /** Creates a project with its single `main` branch (head starts null). */
  createProject(title: string): { project: Project; branch: Branch };
  getProject(projectId: string): Project | undefined;
  getBranch(branchId: string): Branch | undefined;
  getMainBranch(projectId: string): Branch | undefined;
  /** M1: always throws BRANCHING_DISABLED (spec section 9, gated until M3). */
  createBranch(projectId: string, name: string): Branch;
  getHead(branchId: string): string | null;
  getCommit(commitId: string): Commit | undefined;
  listCommits(branchId: string): Commit[];

  /**
   * One atomic commit: validates everything first (scope, references,
   * per-item shape), then inserts rows and moves the head. On any
   * failure nothing is inserted and the head does not move. A repeated
   * `idempotencyKey` on the same branch returns the original commit
   * without inserting anything.
   */
  commit(request: CommitRequest): CommitResult;

  /** Characters are project-level entities, not ledger rows. */
  getOrCreateCharacter(projectId: string, canonicalName: string, aliases?: string[]): Character;
  listCharacters(projectId: string): Character[];

  /**
   * Creates a chapter with revision 1 inside its own commit (spec
   * section 9). `expectedHead` must equal the current branch head.
   */
  createChapter(
    branchId: string,
    input: {
      seq: number;
      title?: string | null;
      body: string;
      source: ChapterSource;
      expectedHead: string | null;
      author?: string;
    },
  ): { chapter: Chapter; revision: ChapterRevision; commit: Commit };

  /** A new revision of an existing chapter, inside its own commit. */
  createChapterRevision(
    branchId: string,
    chapterId: string,
    input: {
      body: string;
      source: ChapterSource;
      expectedHead: string | null;
      author?: string;
    },
  ): { revision: ChapterRevision; commit: Commit };

  getChapterRevision(revisionId: string): ChapterRevision | undefined;
  getActiveRevision(chapterId: string, branchId: string): ChapterRevision | undefined;
  listChapters(branchId: string): Chapter[];

  /**
   * A read-only copy of the branch's rows. With `upToCommitSeq`, only
   * rows from commits with `commit_seq <= upToCommitSeq` are included
   * (chapter heads resolve to the newest revision at or before it).
   */
  snapshot(branchId: string, upToCommitSeq?: number): LedgerSnapshot;

  addFinding(input: NewFinding): Finding;
  listFindings(branchId: string, resolution?: FindingResolution): Finding[];
  resolveFinding(findingId: string, resolution: FindingResolution): Finding;

  /**
   * M1.1 item 6: reviewer mark on a committed knowledge entry. Sets
   * `learnedInStory` with the supporting evidence quote(s). This is
   * workflow annotation (like resolving a finding), not a ledger
   * change: it mutates only these two annotation fields on the entry
   * and never rewrites history. Evidence must be non-empty; the quote
   * should come from the chapter text showing the character retains
   * or refers to what they learned.
   */
  markKnowledgeLearnedInStory(knowledgeId: string, evidence: VerifiedSpan[]): KnowledgeEntry;
}

export type { PromiseStatus };
