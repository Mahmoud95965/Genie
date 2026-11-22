/**
 * Committing accepted review items (M1) — spec sections 2 and 4.
 *
 * Maps a review batch's accepted items to ledger rows: extractor
 * `local_id`s are resolved to real ids inside one commit, character
 * names are resolved to project characters (created on first use), and
 * cross-references must resolve inside the same batch — an extractor
 * output cannot reference entries from an earlier commit by local id.
 *
 * What maps where:
 * - `propositions` -> proposition rows.
 * - `events` -> event rows + participant rows; an event's `knowledge_use`
 *   becomes a `knowledge_uses` row. An event's `knowledge_transfer`
 *   produces NO ledger row of its own: the transfer is represented by
 *   the explicit `knowledge` entries (spec section 3 has no transfer
 *   table); the characters named by a transfer are still created.
 * - `knowledge` -> knowledge rows.
 * - `character_facts` -> character-fact rows.
 * - `promises` -> promise rows for `status_change === "raised"`;
 *   for `fulfilled` / `violated` / `abandoned`, a `promise_resolutions`
 *   row (M1.1 item 2): the reviewer must have chosen the target
 *   promise on the review item (`targetPromiseId`); the resolved-at
 *   event must resolve; a resolution without one is rejected. The
 *   target must already exist in the branch's projection — a promise
 *   raised in the same batch cannot be resolved by the same batch
 *   (commit the raise first, then resolve in a later batch). Known
 *   limitation, recorded in docs.
 * - `knowledge_denials` -> `knowledge_denial` rows (M1.1 item 3):
 *   explicit evidenced records of non-knowledge, added by the reviewer
 *   (not by the extractor). The proposition and stated-at event
 *   resolve through the maps above; at least one evidence span is
 *   required (enforced by the store).
 */
import { randomUUID } from "node:crypto";

import type { Commit } from "../state/types";
import type {
  CommitItems,
  CommitResult,
  RetractInput,
  StoryworldRepository,
} from "../state/repository";
import { ValidationFailedError } from "../state/repository";
import type { ReviewBatch, ReviewItem } from "./queue";
import type { ReviewQueue } from "./queue";
import type { VerifiedSpan } from "../state/types";

export interface CommitBatchOptions {
  branchId: string;
  expectedHead: string | null;
  author?: string;
  idempotencyKey?: string;
  retracts?: RetractInput[];
  /**
   * local_id -> real id for entries committed by earlier batches. The
   * fixture uses globally unique local ids across chapters, so a later
   * chapter may reference an earlier chapter's proposition or event;
   * batch-local entries override these. Without this map, references
   * resolve inside the batch only.
   */
  knownPropositions?: Map<string, string>;
  knownEvents?: Map<string, string>;
}

export interface CommitBatchResult {
  commit: Commit;
  newHead: string;
  /** local_id -> real id, per section, for items committed in this batch. */
  mappings: {
    propositions: Map<string, string>;
    events: Map<string, string>;
  };
  committed: {
    propositions: string[];
    events: string[];
    knowledge: string[];
    characterFacts: string[];
    promises: string[];
    knowledgeUses: string[];
    resolutions: string[];
    knowledgeDenials: string[];
  };
  rejected: Array<{ itemId: string; reason: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStringOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : asString(value);
}

function asIntegerOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/** Evidence spans for a ledger row, with chosen occurrences applied. */
function buildVerifiedSpans(batch: ReviewBatch, item: ReviewItem): VerifiedSpan[] {
  if (batch.chapterRevisionId === null) {
    throw new ValidationFailedError([
      { path: item.id, message: "batch has no chapter revision; evidence cannot be bound" },
    ]);
  }
  return item.evidence.map((s) => {
    const [start, end] = s.chosenOccurrence ?? [s.startOffset, s.endOffset];
    return {
      quote: s.quote,
      startOffset: start,
      endOffset: end,
      chapterRevisionId: batch.chapterRevisionId as string,
      bodySha256: batch.bodySha256,
    };
  });
}

export function commitBatch(
  queue: ReviewQueue,
  batchId: string,
  repo: StoryworldRepository,
  options: CommitBatchOptions,
): CommitBatchResult {
  const batch = queue.getBatch(batchId);
  const branch = repo.getBranch(options.branchId);
  if (!branch) {
    throw new ValidationFailedError([{ path: "$.branchId", message: `unknown branch ${options.branchId}` }]);
  }
  const accepted = batch.items.filter((i) => i.status === "accepted");
  const rejected = batch.items
    .filter((i) => i.status === "rejected")
    .map((i) => ({ itemId: i.id, reason: i.rejectReason ?? "rejected" }));

  const issues: Array<{ path: string; message: string }> = [];
  const fail = (path: string, message: string) => issues.push({ path, message });

  if (accepted.length > 0 && batch.chapterRevisionId === null) {
    fail("$", "accepted items need a chapter revision id on the batch");
  }

  const items: CommitItems = {
    propositions: [],
    events: [],
    knowledge: [],
    knowledgeUses: [],
    characterFacts: [],
    promises: [],
    resolutions: [],
    knowledgeDenials: [],
  };
  // Earlier batches' local ids (fixture-wide ids); batch-local entries
  // below override them.
  const propMap = new Map<string, string>(options.knownPropositions ?? []);
  const eventMap = new Map<string, string>(options.knownEvents ?? []);
  const committed = {
    propositions: [] as string[],
    events: [] as string[],
    knowledge: [] as string[],
    characterFacts: [] as string[],
    promises: [] as string[],
    knowledgeUses: [] as string[],
    resolutions: [] as string[],
    knowledgeDenials: [] as string[],
  };

  // Character names referenced by accepted items (created on first use).
  const characterNames = new Set<string>();
  const collectNames = (item: ReviewItem) => {
    const data = item.data;
    if (item.section === "events") {
      const participants = Array.isArray(data.participants) ? data.participants : [];
      for (const p of participants) {
        if (isRecord(p)) {
          const name = asString(p.character);
          if (name) characterNames.add(name);
        }
      }
      if (isRecord(data.knowledge_transfer)) {
        const from = asString(data.knowledge_transfer.from_character);
        if (from) characterNames.add(from);
        const to = data.knowledge_transfer.to_characters;
        if (Array.isArray(to)) for (const n of to) if (typeof n === "string") characterNames.add(n);
      }
      if (isRecord(data.knowledge_use)) {
        const name = asString(data.knowledge_use.character);
        if (name) characterNames.add(name);
      }
    }
    if (item.section === "knowledge" || item.section === "character_facts") {
      const name = asString(data.character);
      if (name) characterNames.add(name);
    }
    if (item.section === "knowledge_denials") {
      const name = asString(data.character);
      if (name) characterNames.add(name);
    }
  };
  for (const item of accepted) collectNames(item);
  const characterIds = new Map<string, string>();
  for (const name of characterNames) {
    characterIds.set(name, repo.getOrCreateCharacter(branch.projectId, name).id);
  }
  const characterId = (item: ReviewItem, name: unknown): string | null => {
    const n = asString(name);
    if (!n) {
      fail(item.id, "missing character name");
      return null;
    }
    const id = characterIds.get(n);
    if (!id) {
      fail(item.id, `character ${JSON.stringify(n)} was not created`);
      return null;
    }
    return id;
  };

  // 1. Propositions.
  for (const item of accepted.filter((i) => i.section === "propositions")) {
    const id = randomUUID();
    if (item.localId) propMap.set(item.localId, id);
    const statement = asString(item.data.statement);
    if (!statement) {
      fail(item.id, "statement must be a non-empty string");
      continue;
    }
    items.propositions.push({ id, statement, evidence: buildVerifiedSpans(batch, item) });
    committed.propositions.push(id);
  }

  // 2. Events (+ participants, + knowledge uses from the event).
  const pendingUses: Array<{ item: ReviewItem; eventId: string; character: unknown; propositionLocalId: unknown }> = [];
  for (const item of accepted.filter((i) => i.section === "events")) {
    const id = randomUUID();
    if (item.localId) eventMap.set(item.localId, id);
    const data = item.data;
    const participants: Array<{ characterId: string; role: "actor" | "victim" | "speaker" | "listener" | "observer" | "subject" }> = [];
    const rawParts = Array.isArray(data.participants) ? data.participants : [];
    for (const p of rawParts) {
      if (!isRecord(p)) continue;
      const cid = characterId(item, p.character);
      const role = asString(p.role);
      if (
        cid &&
        (role === "actor" ||
          role === "victim" ||
          role === "speaker" ||
          role === "listener" ||
          role === "observer" ||
          role === "subject")
      ) {
        participants.push({ characterId: cid, role });
      }
    }
    const summary = asString(data.summary);
    if (!summary) {
      fail(item.id, "summary must be a non-empty string");
      continue;
    }
    items.events.push({
      id,
      chapterRevisionId: batch.chapterRevisionId as string,
      kind: (data.kind as CommitItems["events"][number]["kind"]) ?? "other",
      summary,
      location: asStringOrNull(data.location),
      storyTime: asStringOrNull(data.story_time),
      spanStart: asIntegerOrNull(data.span_start),
      spanEnd: asIntegerOrNull(data.span_end),
      realityScope: (data.reality_scope as CommitItems["events"][number]["realityScope"]) ?? "real",
      certainty: (data.certainty as CommitItems["events"][number]["certainty"]) ?? "asserted",
      participants,
      evidence: buildVerifiedSpans(batch, item),
    });
    committed.events.push(id);
    if (isRecord(data.knowledge_use)) {
      pendingUses.push({
        item,
        eventId: id,
        character: data.knowledge_use.character,
        propositionLocalId: data.knowledge_use.proposition_local_id,
      });
    }
  }

  // 3. Knowledge uses from events.
  for (const use of pendingUses) {
    const cid = characterId(use.item, use.character);
    const propLocalId = asString(use.propositionLocalId);
    const propId = propLocalId ? propMap.get(propLocalId) : undefined;
    if (!propLocalId || !propId) {
      fail(use.item.id, `knowledge_use references unknown proposition ${JSON.stringify(propLocalId)}`);
      continue;
    }
    if (!cid) continue;
    items.knowledgeUses.push({ eventId: use.eventId, characterId: cid, propositionId: propId });
    committed.knowledgeUses.push(`${use.eventId}:${cid}:${propId}`);
  }

  // 4. Knowledge entries.
  for (const item of accepted.filter((i) => i.section === "knowledge")) {
    const data = item.data;
    const cid = characterId(item, data.character);
    const propLocalId = asString(data.proposition_local_id);
    const propId = propLocalId ? propMap.get(propLocalId) : undefined;
    const learnLocalId = asString(data.learned_at_event_local_id);
    const learnId = learnLocalId ? eventMap.get(learnLocalId) : undefined;
    if (!propLocalId || !propId) {
      fail(item.id, `references unknown proposition ${JSON.stringify(propLocalId)}`);
      continue;
    }
    if (!learnLocalId || !learnId) {
      fail(item.id, `references unknown learn event ${JSON.stringify(learnLocalId)}`);
      continue;
    }
    if (!cid) continue;
    items.knowledge.push({
      id: randomUUID(),
      characterId: cid,
      propositionId: propId,
      learnedAtEventId: learnId,
      learnedHow: (data.learned_how as CommitItems["knowledge"][number]["learnedHow"]) ?? "other",
      certainty: (data.certainty as CommitItems["knowledge"][number]["certainty"]) ?? "asserted",
      evidence: buildVerifiedSpans(batch, item),
    });
    committed.knowledge.push(items.knowledge[items.knowledge.length - 1].id);
  }

  // 5. Character facts.
  for (const item of accepted.filter((i) => i.section === "character_facts")) {
    const data = item.data;
    const cid = characterId(item, data.character);
    const fromLocalId = asString(data.valid_from_event_local_id);
    const fromId = fromLocalId ? eventMap.get(fromLocalId) : undefined;
    if (!fromLocalId || !fromId) {
      fail(item.id, `references unknown valid-from event ${JSON.stringify(fromLocalId)}`);
      continue;
    }
    if (!cid) continue;
    const value = asString(data.value);
    if (!value) {
      fail(item.id, "value must be a non-empty string");
      continue;
    }
    items.characterFacts.push({
      id: randomUUID(),
      characterId: cid,
      kind: (data.kind as CommitItems["characterFacts"][number]["kind"]) ?? "trait",
      value,
      validFromEventId: fromId,
      evidence: buildVerifiedSpans(batch, item),
    });
    committed.characterFacts.push(items.characterFacts[items.characterFacts.length - 1].id);
  }

  // 6. Promises — `raised` creates a promise row; a resolution
  // status_change (M1.1 item 2) creates a `promise_resolutions` row
  // against the reviewer-chosen target. The evidence span is the
  // candidate's verified quote (kept on the review item for audit;
  // the resolution row itself carries promise_id, resolved_at_event_id
  // and status, per the spec table).
  const existingPromiseIds = new Set(repo.snapshot(options.branchId).promises.map((p) => p.id));
  for (const item of accepted.filter((i) => i.section === "promises")) {
    const data = item.data;
    const statusChange = asString(data.status_change);
    if (statusChange === "raised") {
      const raisedLocalId = asString(data.raised_at_event_local_id);
      const raisedId = raisedLocalId ? eventMap.get(raisedLocalId) : undefined;
      if (!raisedLocalId || !raisedId) {
        fail(item.id, `references unknown raised-at event ${JSON.stringify(raisedLocalId)}`);
        continue;
      }
      const deadlineLocalId = asString(data.deadline_event_local_id);
      const deadlineId = deadlineLocalId ? eventMap.get(deadlineLocalId) : undefined;
      if (deadlineLocalId && !deadlineId) {
        fail(item.id, `references unknown deadline event ${JSON.stringify(deadlineLocalId)}`);
        continue;
      }
      const description = asString(data.description);
      if (!description) {
        fail(item.id, "description must be a non-empty string");
        continue;
      }
      items.promises.push({
        id: randomUUID(),
        description,
        raisedAtEventId: raisedId,
        deadlineEventId: deadlineId ?? null,
        deadlineCondition: asStringOrNull(data.deadline_condition),
        evidence: buildVerifiedSpans(batch, item),
      });
      committed.promises.push(items.promises[items.promises.length - 1].id);
      continue;
    }
    if (statusChange !== "fulfilled" && statusChange !== "violated" && statusChange !== "abandoned") {
      fail(item.id, `unknown promise status_change ${JSON.stringify(statusChange)}`);
      continue;
    }
    // Resolution: the reviewer must have chosen a target promise, and
    // the resolved-at event must be given and resolvable.
    if (item.targetPromiseId === null) {
      fail(
        item.id,
        `resolution candidate has no target promise; the reviewer must select one before accepting`,
      );
      continue;
    }
    if (!existingPromiseIds.has(item.targetPromiseId)) {
      fail(item.id, `target promise ${item.targetPromiseId} does not exist in this branch`);
      continue;
    }
    const resolvedLocalId = asString(data.resolved_at_event_local_id);
    if (!resolvedLocalId) {
      fail(item.id, `resolution has no resolved_at_event_local_id`);
      continue;
    }
    const resolvedId = eventMap.get(resolvedLocalId);
    if (!resolvedId) {
      fail(item.id, `references unknown resolved-at event ${JSON.stringify(resolvedLocalId)}`);
      continue;
    }
    items.resolutions.push({
      id: randomUUID(),
      promiseId: item.targetPromiseId,
      resolvedAtEventId: resolvedId,
      status: statusChange,
    });
    committed.resolutions.push(items.resolutions[items.resolutions.length - 1].id);
  }

  // 7. Knowledge denials (M1.1 item 3): explicit evidenced records of
  // non-knowledge. Proposition and stated-at event resolve through the
  // maps built above (same batch or earlier).
  for (const item of accepted.filter((i) => i.section === "knowledge_denials")) {
    const data = item.data;
    const denialCharacterId = characterId(item, data.character);
    if (!denialCharacterId) continue;
    const propositionLocalId = asString(data.proposition_local_id);
    const propositionId = propositionLocalId ? propMap.get(propositionLocalId) : undefined;
    if (!propositionLocalId || !propositionId) {
      fail(item.id, `references unknown proposition ${JSON.stringify(propositionLocalId)}`);
      continue;
    }
    const statedLocalId = asString(data.stated_at_event_local_id);
    const statedId = statedLocalId ? eventMap.get(statedLocalId) : undefined;
    if (!statedLocalId || !statedId) {
      fail(item.id, `references unknown stated-at event ${JSON.stringify(statedLocalId)}`);
      continue;
    }
    items.knowledgeDenials.push({
      id: randomUUID(),
      characterId: denialCharacterId,
      propositionId,
      statedAtEventId: statedId,
      evidence: buildVerifiedSpans(batch, item),
    });
    committed.knowledgeDenials.push(items.knowledgeDenials[items.knowledgeDenials.length - 1].id);
  }

  if (issues.length > 0) throw new ValidationFailedError(issues);

  const result: CommitResult = repo.commit({
    branchId: options.branchId,
    expectedHead: options.expectedHead,
    author: options.author ?? "human",
    idempotencyKey: options.idempotencyKey,
    items,
    retracts: options.retracts ?? [],
  });
  return {
    commit: result.commit,
    newHead: result.newHead,
    mappings: { propositions: propMap, events: eventMap },
    committed,
    rejected,
  };
}
