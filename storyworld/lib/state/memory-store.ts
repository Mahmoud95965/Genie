/**
 * In-memory Story-World repository (M1) — spec sections 2, 3 and 9.
 *
 * Implements `StoryworldRepository` with plain arrays. Append-only: no
 * method updates or deletes a ledger row; retractions are new rows.
 * `commit()` validates everything before mutating anything, so a failed
 * commit inserts nothing and never moves the head (atomicity).
 *
 * M1 scope: one `main` branch per project, a single linear commit
 * sequence. `createBranch()` always throws `BRANCHING_DISABLED`.
 */
import { randomUUID, createHash } from "node:crypto";

import { normalizeBody } from "../extractor/evidence";
import type {
  Branch,
  Chapter,
  ChapterHead,
  ChapterRevision,
  ChapterSource,
  Character,
  CharacterFactEntry,
  Commit,
  EventEntry,
  EventParticipant,
  Finding,
  FindingResolution,
  KnowledgeEntry,
  KnowledgeUse,
  Project,
  PromiseEntry,
  PromiseResolution,
  Proposition,
  Retraction,
} from "./types";
import {
  BranchingDisabledError,
  ChapterSeqExistsError,
  CommitRequest,
  CommitResult,
  HeadConflictError,
  LedgerSnapshot as LedgerSnapshotType,
  NewFinding,
  NotFoundError,
  ScopeViolationError,
  StoryworldRepository,
  ValidationFailedError,
  emptyCommitItems,
} from "./repository";

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

type Issue = { path: string; message: string };

export class InMemoryStoryworldRepository implements StoryworldRepository {
  private projects: Project[] = [];
  private branches: Branch[] = [];
  private heads = new Map<string, string | null>();
  private commits: Commit[] = [];
  private characters: Character[] = [];
  private chapters: Chapter[] = [];
  private revisions: ChapterRevision[] = [];
  private chapterHeads: ChapterHead[] = [];
  private propositions: Proposition[] = [];
  private events: EventEntry[] = [];
  private participants: EventParticipant[] = [];
  private knowledge: KnowledgeEntry[] = [];
  private knowledgeUses: KnowledgeUse[] = [];
  private characterFacts: CharacterFactEntry[] = [];
  private promises: PromiseEntry[] = [];
  private promiseResolutions: PromiseResolution[] = [];
  private retractions: Retraction[] = [];
  private findings: Finding[] = [];

  createProject(title: string): { project: Project; branch: Branch } {
    const now = new Date().toISOString();
    const project: Project = { id: randomUUID(), title, createdAt: now };
    const branch: Branch = {
      id: randomUUID(),
      projectId: project.id,
      name: "main",
      parentBranchId: null,
      forkCommitId: null,
      createdAt: now,
    };
    this.projects.push(project);
    this.branches.push(branch);
    this.heads.set(branch.id, null);
    return { project, branch };
  }

  getProject(projectId: string): Project | undefined {
    return this.projects.find((p) => p.id === projectId);
  }

  getBranch(branchId: string): Branch | undefined {
    return this.branches.find((b) => b.id === branchId);
  }

  getMainBranch(projectId: string): Branch | undefined {
    return this.branches.find((b) => b.projectId === projectId && b.name === "main");
  }

  createBranch(_projectId: string, _name: string): Branch {
    // M1: branching is gated until M3 (spec section 9).
    throw new BranchingDisabledError();
  }

  getHead(branchId: string): string | null {
    return this.heads.get(branchId) ?? null;
  }

  getCommit(commitId: string): Commit | undefined {
    return this.commits.find((c) => c.id === commitId);
  }

  listCommits(branchId: string): Commit[] {
    return this.commits
      .filter((c) => c.branchId === branchId)
      .sort((a, b) => a.commitSeq - b.commitSeq);
  }

  commit(request: CommitRequest): CommitResult {
    const branch = this.getBranch(request.branchId);
    if (!branch) throw new NotFoundError(`Unknown branch: ${request.branchId}`);
    const currentHead = this.getHead(request.branchId);
    if (currentHead !== request.expectedHead) {
      throw new HeadConflictError(
        `HEAD_CONFLICT: expected head ${request.expectedHead ?? "null"} but current head is ${currentHead ?? "null"}.`,
      );
    }
    if (request.idempotencyKey) {
      const existing = this.commits.find(
        (c) => c.branchId === request.branchId && c.idempotencyKey === request.idempotencyKey,
      );
      if (existing) {
        // Idempotent replay: return the original commit, insert nothing.
        return {
          commit: existing,
          newHead: currentHead ?? existing.id,
          inserted: {
            propositions: [],
            events: [],
            knowledge: [],
            knowledgeUses: [],
            characterFacts: [],
            promises: [],
          },
          retractions: [],
        };
      }
    }

    const issues = this.validateCommit(branch, request);
    if (issues.length > 0) throw new ValidationFailedError(issues);

    // --- All validation passed: apply. ---
    const now = new Date().toISOString();
    const seq =
      this.commits.filter((c) => c.branchId === request.branchId).reduce((m, c) => Math.max(m, c.commitSeq), 0) + 1;
    const commit: Commit = {
      id: randomUUID(),
      branchId: request.branchId,
      commitSeq: seq,
      parentCommitId: currentHead,
      author: request.author ?? "human",
      idempotencyKey: request.idempotencyKey ?? null,
      createdAt: now,
    };
    this.commits.push(commit);
    const items = request.items;

    const insertedPropositions: Proposition[] = items.propositions.map((p) => ({
      id: p.id,
      branchId: request.branchId,
      statement: p.statement,
      createdInCommitId: commit.id,
      evidence: p.evidence,
    }));
    const insertedEvents: EventEntry[] = items.events.map((e) => ({
      id: e.id,
      branchId: request.branchId,
      commitId: commit.id,
      chapterRevisionId: e.chapterRevisionId,
      kind: e.kind,
      summary: e.summary,
      location: e.location,
      storyTime: e.storyTime,
      spanStart: e.spanStart,
      spanEnd: e.spanEnd,
      realityScope: e.realityScope,
      certainty: e.certainty,
      evidence: e.evidence,
    }));
    const insertedParticipants: EventParticipant[] = [];
    for (const e of items.events) {
      for (const p of e.participants) {
        insertedParticipants.push({
          eventId: e.id,
          branchId: request.branchId,
          characterId: p.characterId,
          role: p.role,
        });
      }
    }
    const insertedKnowledge: KnowledgeEntry[] = items.knowledge.map((k) => ({
      id: k.id,
      branchId: request.branchId,
      commitId: commit.id,
      characterId: k.characterId,
      propositionId: k.propositionId,
      learnedAtEventId: k.learnedAtEventId,
      learnedHow: k.learnedHow,
      certainty: k.certainty,
      evidence: k.evidence,
    }));
    const insertedKnowledgeUses: KnowledgeUse[] = items.knowledgeUses.map((u) => ({
      eventId: u.eventId,
      branchId: request.branchId,
      characterId: u.characterId,
      propositionId: u.propositionId,
    }));
    const insertedFacts: CharacterFactEntry[] = items.characterFacts.map((f) => ({
      id: f.id,
      branchId: request.branchId,
      commitId: commit.id,
      characterId: f.characterId,
      kind: f.kind,
      value: f.value,
      validFromEventId: f.validFromEventId,
      evidence: f.evidence,
    }));
    const insertedPromises: PromiseEntry[] = items.promises.map((p) => ({
      id: p.id,
      branchId: request.branchId,
      commitId: commit.id,
      description: p.description,
      raisedAtEventId: p.raisedAtEventId,
      deadlineEventId: p.deadlineEventId,
      deadlineCondition: p.deadlineCondition,
      evidence: p.evidence,
    }));
    const insertedRetractions: Retraction[] = (request.retracts ?? []).map((r) => ({
      id: randomUUID(),
      branchId: request.branchId,
      commitId: commit.id,
      entryTable: r.entryTable,
      entryId: r.entryId,
      reason: r.reason,
    }));

    this.propositions.push(...insertedPropositions);
    this.events.push(...insertedEvents);
    this.participants.push(...insertedParticipants);
    this.knowledge.push(...insertedKnowledge);
    this.knowledgeUses.push(...insertedKnowledgeUses);
    this.characterFacts.push(...insertedFacts);
    this.promises.push(...insertedPromises);
    this.retractions.push(...insertedRetractions);
    this.heads.set(request.branchId, commit.id);

    return {
      commit,
      newHead: commit.id,
      inserted: {
        propositions: insertedPropositions,
        events: insertedEvents,
        knowledge: insertedKnowledge,
        knowledgeUses: insertedKnowledgeUses,
        characterFacts: insertedFacts,
        promises: insertedPromises,
      },
      retractions: insertedRetractions,
    };
  }

  /**
   * Validates a commit request against current branch state plus the
   * request's own new rows (intra-commit references are allowed).
   * Returns every problem; throws nothing.
   */
  private validateCommit(branch: Branch, request: CommitRequest): Issue[] {
    const issues: Issue[] = [];
    const items = request.items;
    const projectId = branch.projectId;

    const knownCharacters = new Set(this.characters.filter((c) => c.projectId === projectId).map((c) => c.id));
    const knownPropositions = new Set(
      this.propositions.filter((p) => p.branchId === branch.id).map((p) => p.id),
    );
    const knownEvents = new Set(this.events.filter((e) => e.branchId === branch.id).map((e) => e.id));
    const knownRevisions = new Set(
      this.revisions.filter((r) => r.branchId === branch.id).map((r) => r.id),
    );
    for (const p of items.propositions) knownPropositions.add(p.id);
    for (const e of items.events) knownEvents.add(e.id);

    const checkCharacter = (path: string, characterId: string) => {
      if (!knownCharacters.has(characterId)) {
        throw new ScopeViolationError(
          `SCOPE_VIOLATION: character ${characterId} does not belong to project ${projectId} (${path}).`,
        );
      }
    };
    const checkEvidence = (path: string, evidence: { quote: string }[]) => {
      if (!Array.isArray(evidence) || evidence.length === 0) {
        issues.push({ path, message: "at least one evidence span is required" });
      }
    };

    // Duplicate ids inside the request.
    const seen = new Set<string>();
    for (const [table, ids] of [
      ["proposition", items.propositions.map((p) => p.id)],
      ["event", items.events.map((e) => e.id)],
      ["knowledge", items.knowledge.map((k) => k.id)],
      ["character_fact", items.characterFacts.map((f) => f.id)],
      ["promise", items.promises.map((p) => p.id)],
    ] as Array<[string, string[]]>) {
      for (const id of ids) {
        const key = `${table}:${id}`;
        if (seen.has(key)) issues.push({ path: `$${table}`, message: `duplicate id ${id} in this commit` });
        seen.add(key);
      }
    }
    // Ids must not collide with existing rows in this branch.
    for (const p of items.propositions) {
      if (this.propositions.some((x) => x.branchId === branch.id && x.id === p.id)) {
        issues.push({ path: "$.propositions", message: `id ${p.id} already exists` });
      }
    }
    for (const e of items.events) {
      if (this.events.some((x) => x.branchId === branch.id && x.id === e.id)) {
        issues.push({ path: "$.events", message: `id ${e.id} already exists` });
      }
    }
    for (const k of items.knowledge) {
      if (this.knowledge.some((x) => x.branchId === branch.id && x.id === k.id)) {
        issues.push({ path: "$.knowledge", message: `id ${k.id} already exists` });
      }
    }
    for (const f of items.characterFacts) {
      if (this.characterFacts.some((x) => x.branchId === branch.id && x.id === f.id)) {
        issues.push({ path: "$.character_facts", message: `id ${f.id} already exists` });
      }
    }
    for (const p of items.promises) {
      if (this.promises.some((x) => x.branchId === branch.id && x.id === p.id)) {
        issues.push({ path: "$.promises", message: `id ${p.id} already exists` });
      }
    }

    for (const [i, p] of items.propositions.entries()) {
      if (typeof p.statement !== "string" || p.statement.trim().length === 0) {
        issues.push({ path: `$.propositions[${i}]`, message: "statement must be a non-empty string" });
      }
      checkEvidence(`$.propositions[${i}].evidence`, p.evidence);
    }

    for (const [i, e] of items.events.entries()) {
      const path = `$.events[${i}]`;
      if (!knownRevisions.has(e.chapterRevisionId)) {
        issues.push({ path, message: `unknown chapter revision ${e.chapterRevisionId} in this branch` });
      }
      if (typeof e.summary !== "string" || e.summary.trim().length === 0) {
        issues.push({ path, message: "summary must be a non-empty string" });
      }
      if (
        (e.spanStart !== null && !Number.isInteger(e.spanStart)) ||
        (e.spanEnd !== null && !Number.isInteger(e.spanEnd))
      ) {
        issues.push({ path, message: "spanStart/spanEnd must be integers or null" });
      }
      checkEvidence(`${path}.evidence`, e.evidence);
      // An event's evidence must cite its own chapter revision.
      for (const s of e.evidence) {
        if (s.chapterRevisionId !== e.chapterRevisionId) {
          issues.push({
            path: `${path}.evidence`,
            message: `evidence span cites revision ${s.chapterRevisionId}, event belongs to ${e.chapterRevisionId}`,
          });
        }
      }
      const seenRoles = new Set<string>();
      for (const [j, part] of e.participants.entries()) {
        checkCharacter(`${path}.participants[${j}]`, part.characterId);
        const key = `${part.characterId}:${part.role}`;
        if (seenRoles.has(key)) {
          issues.push({ path: `${path}.participants[${j}]`, message: `duplicate participant ${key}` });
        }
        seenRoles.add(key);
      }
    }

    for (const [i, k] of items.knowledge.entries()) {
      const path = `$.knowledge[${i}]`;
      checkCharacter(`${path}.characterId`, k.characterId);
      if (!knownPropositions.has(k.propositionId)) {
        issues.push({ path, message: `unknown proposition ${k.propositionId} in this branch` });
      }
      if (!knownEvents.has(k.learnedAtEventId)) {
        issues.push({ path, message: `unknown learn event ${k.learnedAtEventId} in this branch` });
      }
      checkEvidence(`${path}.evidence`, k.evidence);
    }

    for (const [i, u] of items.knowledgeUses.entries()) {
      const path = `$.knowledgeUses[${i}]`;
      checkCharacter(`${path}.characterId`, u.characterId);
      if (!knownEvents.has(u.eventId)) {
        issues.push({ path, message: `unknown event ${u.eventId} in this branch` });
      }
      if (!knownPropositions.has(u.propositionId)) {
        issues.push({ path, message: `unknown proposition ${u.propositionId} in this branch` });
      }
      if (
        this.knowledgeUses.some(
          (x) =>
            x.branchId === branch.id &&
            x.eventId === u.eventId &&
            x.characterId === u.characterId &&
            x.propositionId === u.propositionId,
        ) ||
        items.knowledgeUses.some(
          (x, j) =>
            j < i &&
            x.eventId === u.eventId &&
            x.characterId === u.characterId &&
            x.propositionId === u.propositionId,
        )
      ) {
        issues.push({ path, message: "duplicate knowledge use" });
      }
    }

    for (const [i, f] of items.characterFacts.entries()) {
      const path = `$.characterFacts[${i}]`;
      checkCharacter(`${path}.characterId`, f.characterId);
      if (!knownEvents.has(f.validFromEventId)) {
        issues.push({ path, message: `unknown valid-from event ${f.validFromEventId} in this branch` });
      }
      if (typeof f.value !== "string" || f.value.trim().length === 0) {
        issues.push({ path, message: "value must be a non-empty string" });
      }
      checkEvidence(`${path}.evidence`, f.evidence);
    }

    for (const [i, p] of items.promises.entries()) {
      const path = `$.promises[${i}]`;
      if (!knownEvents.has(p.raisedAtEventId)) {
        issues.push({ path, message: `unknown raised-at event ${p.raisedAtEventId} in this branch` });
      }
      if (p.deadlineEventId !== null && !knownEvents.has(p.deadlineEventId)) {
        issues.push({ path, message: `unknown deadline event ${p.deadlineEventId} in this branch` });
      }
      if (typeof p.description !== "string" || p.description.trim().length === 0) {
        issues.push({ path, message: "description must be a non-empty string" });
      }
      checkEvidence(`${path}.evidence`, p.evidence);
    }

    for (const [i, r] of (request.retracts ?? []).entries()) {
      const path = `$.retracts[${i}]`;
      const exists =
        (r.entryTable === "event" && this.events.some((x) => x.branchId === branch.id && x.id === r.entryId)) ||
        (r.entryTable === "knowledge" && this.knowledge.some((x) => x.branchId === branch.id && x.id === r.entryId)) ||
        (r.entryTable === "character_fact" &&
          this.characterFacts.some((x) => x.branchId === branch.id && x.id === r.entryId)) ||
        (r.entryTable === "promise" && this.promises.some((x) => x.branchId === branch.id && x.id === r.entryId)) ||
        (r.entryTable === "proposition" &&
          this.propositions.some((x) => x.branchId === branch.id && x.id === r.entryId));
      if (!exists) {
        issues.push({ path, message: `unknown ${r.entryTable} entry ${r.entryId} in this branch` });
      } else if (
        this.retractions.some(
          (x) => x.branchId === branch.id && x.entryTable === r.entryTable && x.entryId === r.entryId,
        )
      ) {
        issues.push({ path, message: `entry ${r.entryId} is already retracted` });
      }
      if (typeof r.reason !== "string" || r.reason.trim().length === 0) {
        issues.push({ path, message: "reason must be a non-empty string" });
      }
    }
    return issues;
  }

  getOrCreateCharacter(projectId: string, canonicalName: string, aliases: string[] = []): Character {
    const existing = this.characters.find(
      (c) => c.projectId === projectId && c.canonicalName === canonicalName,
    );
    if (existing) return existing;
    const character: Character = {
      id: randomUUID(),
      projectId,
      canonicalName,
      aliases: [...aliases],
    };
    this.characters.push(character);
    return character;
  }

  listCharacters(projectId: string): Character[] {
    return this.characters.filter((c) => c.projectId === projectId);
  }

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
  ): { chapter: Chapter; revision: ChapterRevision; commit: Commit } {
    const branch = this.getBranch(branchId);
    if (!branch) throw new NotFoundError(`Unknown branch: ${branchId}`);
    if (this.chapters.some((c) => c.branchId === branchId && c.seq === input.seq)) {
      throw new ChapterSeqExistsError(`Chapter seq ${input.seq} is already used in this branch.`);
    }
    // Own commit (empty items) — chapter creation is a commit (spec 9).
    const { commit } = this.commit({
      branchId,
      expectedHead: input.expectedHead,
      author: input.author ?? "human",
      items: emptyCommitItems(),
    });
    const chapter: Chapter = {
      id: randomUUID(),
      branchId,
      seq: input.seq,
      title: input.title ?? null,
    };
    const bodyNormalized = normalizeBody(input.body);
    const revision: ChapterRevision = {
      id: randomUUID(),
      chapterId: chapter.id,
      branchId,
      revisionNo: 1,
      bodyNormalized,
      bodySha256: sha256Hex(bodyNormalized),
      source: input.source,
      createdInCommitId: commit.id,
      createdAt: new Date().toISOString(),
    };
    this.chapters.push(chapter);
    this.revisions.push(revision);
    this.chapterHeads.push({ chapterId: chapter.id, branchId, activeRevisionId: revision.id });
    return { chapter, revision, commit };
  }

  createChapterRevision(
    branchId: string,
    chapterId: string,
    input: {
      body: string;
      source: ChapterSource;
      expectedHead: string | null;
      author?: string;
    },
  ): { revision: ChapterRevision; commit: Commit } {
    const branch = this.getBranch(branchId);
    if (!branch) throw new NotFoundError(`Unknown branch: ${branchId}`);
    const chapter = this.chapters.find((c) => c.id === chapterId && c.branchId === branchId);
    if (!chapter) throw new NotFoundError(`Unknown chapter: ${chapterId} in branch ${branchId}`);
    const { commit } = this.commit({
      branchId,
      expectedHead: input.expectedHead,
      author: input.author ?? "human",
      items: emptyCommitItems(),
    });
    const revisionNo =
      this.revisions.filter((r) => r.chapterId === chapterId).reduce((m, r) => Math.max(m, r.revisionNo), 0) + 1;
    const bodyNormalized = normalizeBody(input.body);
    const revision: ChapterRevision = {
      id: randomUUID(),
      chapterId,
      branchId,
      revisionNo,
      bodyNormalized,
      bodySha256: sha256Hex(bodyNormalized),
      source: input.source,
      createdInCommitId: commit.id,
      createdAt: new Date().toISOString(),
    };
    this.revisions.push(revision);
    const head = this.chapterHeads.find((h) => h.chapterId === chapterId && h.branchId === branchId);
    if (head) head.activeRevisionId = revision.id;
    else this.chapterHeads.push({ chapterId, branchId, activeRevisionId: revision.id });
    return { revision, commit };
  }

  getChapterRevision(revisionId: string): ChapterRevision | undefined {
    return this.revisions.find((r) => r.id === revisionId);
  }

  getActiveRevision(chapterId: string, branchId: string): ChapterRevision | undefined {
    const head = this.chapterHeads.find((h) => h.chapterId === chapterId && h.branchId === branchId);
    if (!head) return undefined;
    return this.revisions.find((r) => r.id === head.activeRevisionId);
  }

  listChapters(branchId: string): Chapter[] {
    return this.chapters
      .filter((c) => c.branchId === branchId)
      .sort((a, b) => a.seq - b.seq);
  }

  snapshot(branchId: string, upToCommitSeq?: number): LedgerSnapshotType {
    const branch = this.getBranch(branchId);
    if (!branch) throw new NotFoundError(`Unknown branch: ${branchId}`);
    const commits = this.listCommits(branchId);
    const seqByCommit = new Map(commits.map((c) => [c.id, c.commitSeq] as [string, number]));
    const inScope = (commitId: string): boolean =>
      upToCommitSeq === undefined || (seqByCommit.get(commitId) ?? Infinity) <= upToCommitSeq;
    const headCommitId = this.getHead(branchId);

    const revisions = this.revisions.filter((r) => r.branchId === branchId && inScope(r.createdInCommitId));
    // Chapter heads as of the cutoff: newest revision at or before it.
    const chapterHeads: ChapterHead[] = [];
    for (const chapter of this.chapters.filter((c) => c.branchId === branchId)) {
      const candidates = revisions
        .filter((r) => r.chapterId === chapter.id)
        .sort((a, b) => b.revisionNo - a.revisionNo);
      if (candidates.length > 0) {
        chapterHeads.push({
          chapterId: chapter.id,
          branchId,
          activeRevisionId: candidates[0].id,
        });
      }
    }

    return {
      branchId,
      headCommitId: upToCommitSeq === undefined ? headCommitId : (commits.filter((c) => c.commitSeq <= upToCommitSeq).sort((a, b) => b.commitSeq - a.commitSeq)[0]?.id ?? null),
      commits: upToCommitSeq === undefined ? commits : commits.filter((c) => c.commitSeq <= upToCommitSeq),
      characters: this.characters.filter((c) => c.projectId === branch.projectId),
      chapters: this.chapters.filter((c) => c.branchId === branchId),
      chapterRevisions: revisions,
      chapterHeads,
      propositions: this.propositions.filter((p) => p.branchId === branchId && inScope(p.createdInCommitId)),
      events: this.events.filter((e) => e.branchId === branchId && inScope(e.commitId)),
      participants: this.participants.filter(
        (p) => p.branchId === branchId && this.events.some((e) => e.id === p.eventId && inScope(e.commitId)),
      ),
      knowledge: this.knowledge.filter((k) => k.branchId === branchId && inScope(k.commitId)),
      knowledgeUses: this.knowledgeUses.filter(
        (u) => u.branchId === branchId && this.events.some((e) => e.id === u.eventId && inScope(e.commitId)),
      ),
      characterFacts: this.characterFacts.filter((f) => f.branchId === branchId && inScope(f.commitId)),
      promises: this.promises.filter((p) => p.branchId === branchId && inScope(p.commitId)),
      promiseResolutions: this.promiseResolutions.filter((r) => r.branchId === branchId && inScope(r.commitId)),
      retractions: this.retractions.filter((r) => r.branchId === branchId && inScope(r.commitId)),
      findings: this.findings.filter((f) => f.branchId === branchId && inScope(f.commitId)),
    };
  }

  addFinding(input: NewFinding): Finding {
    const finding: Finding = {
      id: randomUUID(),
      branchId: input.branchId,
      commitId: input.commitId,
      source: input.source,
      ruleCode: input.ruleCode,
      confidence: input.confidence,
      description: input.description,
      reason: input.reason ?? null,
      resolution: "open",
      subjects: [...input.subjects],
      evidence: input.evidence,
      createdAt: new Date().toISOString(),
    };
    this.findings.push(finding);
    return finding;
  }

  listFindings(branchId: string, resolution?: FindingResolution): Finding[] {
    return this.findings.filter(
      (f) => f.branchId === branchId && (resolution === undefined || f.resolution === resolution),
    );
  }

  resolveFinding(findingId: string, resolution: FindingResolution): Finding {
    const finding = this.findings.find((f) => f.id === findingId);
    if (!finding) throw new NotFoundError(`Unknown finding: ${findingId}`);
    // `findings.resolution` is workflow state, deliberately mutable;
    // world truth lives only in the ledger (spec section 3).
    finding.resolution = resolution;
    return finding;
  }
}
