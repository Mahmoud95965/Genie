/**
 * Extraction review queue (M1) — spec sections 4 and 9.
 *
 * Candidates from the worker become pending items. Only evidence-verified
 * items can be accepted; accept/reject is explicit per item; a commit
 * groups the accepted items (see `commit.ts`); rejected items are kept
 * with a reason. Ambiguous quotes stay flagged: an item whose quote
 * occurs more than once in the chapter cannot be accepted until a human
 * explicitly chooses one occurrence, and the choice is recorded — the
 * queue never silently picks one.
 *
 * In-memory only; no persistence target exists in M1.
 */
import { randomUUID, createHash } from "node:crypto";

import {
  findQuoteOccurrences,
  normalizeBody,
  verifyEvidenceSpan,
  verifyExtraction,
} from "../extractor/evidence";
import { validateExtractorOutput } from "../extractor/validate";
import type { PromiseStatus } from "../state/types";

export class ReviewError extends Error {
  readonly code:
    | "VALIDATION_FAILED"
    | "NOT_FOUND"
    | "AMBIGUOUS_EVIDENCE"
    | "EVIDENCE_NOT_VERIFIED"
    | "ALREADY_DECIDED";
  constructor(
    code: ReviewError["code"],
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "ReviewError";
    this.code = code;
  }
}

export type ReviewSection =
  | "propositions"
  | "events"
  | "knowledge"
  | "character_facts"
  | "promises"
  | "knowledge_denials";
export type ReviewItemStatus = "pending" | "accepted" | "rejected";

export interface ReviewEvidenceSpan {
  quote: string;
  startOffset: number;
  endOffset: number;
  /** Every occurrence of the quote in the chapter, as code-point spans. */
  occurrences: Array<[number, number]>;
  /** True when the quote occurs more than once. */
  ambiguous: boolean;
  /** The occurrence a human explicitly chose, or null while undecided. */
  chosenOccurrence: [number, number] | null;
}

export interface ReviewItem {
  /** Item path inside the extraction, e.g. `$.events[0]` (stable in-batch id). */
  id: string;
  section: ReviewSection;
  localId: string | null;
  data: Record<string, unknown>;
  evidence: ReviewEvidenceSpan[];
  status: ReviewItemStatus;
  rejectReason: string | null;
  /** Set when evidence verification failed; blocks acceptance. */
  verificationError: string | null;
  /**
   * M1.1 item 2: for a promise-resolution candidate (status_change
   * fulfilled/violated/abandoned), the real ledger id of the promise
   * the reviewer chose as the target. Null until chosen; acceptance
   * is blocked while null. No automatic matching is ever done.
   */
  targetPromiseId: string | null;
  /**
   * Set when the chosen target was already resolved: resolving it
   * again adds a new resolution row, but only after the reviewer
   * confirms the conflict (see `resolutionConflictConfirmed`).
   */
  resolutionConflict: { targetPromiseId: string; previousStatus: PromiseStatus } | null;
  /** Reviewer confirmation for resolving an already-resolved promise. */
  resolutionConflictConfirmed: boolean;
}

export interface ReviewBatch {
  id: string;
  fixtureId: string | null;
  chapterSeq: number | null;
  chapterRevisionId: string | null;
  bodyNormalized: string;
  bodySha256: string;
  items: ReviewItem[];
  createdAt: string;
  /** extractor.v4 batch: every proposition must carry a modality (absence is an error, never "asserted"). */
  requireModality?: boolean;
}

export interface CreateBatchInput {
  body: string;
  /** Validated extractor output (a `GenieExtractorOutput` object). */
  output: unknown;
  chapterRevisionId?: string | null;
  fixtureId?: string | null;
  chapterSeq?: number | null;
  /** Set for extractor.v4 output: validation requires modality on every proposition. */
  requireModality?: boolean;
}

const SECTIONS: ReviewSection[] = ["propositions", "events", "knowledge", "character_facts", "promises"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class ReviewQueue {
  private batches = new Map<string, ReviewBatch>();

  /** Validate + verify an extraction and turn it into reviewable items. */
  createBatch(input: CreateBatchInput): ReviewBatch {
    const validation = validateExtractorOutput(input.output, { requireModality: input.requireModality === true });
    if (!validation.valid) {
      throw new ReviewError(
        "VALIDATION_FAILED",
        validation.errors.map((e) => `${e.path} ${e.message}`).join("; "),
      );
    }
    const bodyNormalized = normalizeBody(input.body);
    const bodySha256 = createHash("sha256").update(bodyNormalized, "utf-8").digest("hex");
    const verification = verifyExtraction(input.body, input.output);
    const verifiedByPath = new Map(verification.verified.map((v) => [v.itemPath, v.spans] as const));
    const rejectedByPath = new Map<string, string>();
    for (const r of verification.rejected) {
      rejectedByPath.set(r.itemPath, r.reason);
    }

    const output = input.output as Record<string, unknown>;
    const items: ReviewItem[] = [];
    for (const section of SECTIONS) {
      const sectionItems = output[section];
      if (!Array.isArray(sectionItems)) continue;
      sectionItems.forEach((rawItem, i) => {
        if (!isRecord(rawItem)) return;
        const itemPath = `$.${section}[${i}]`;
        const evidenceSpans: ReviewEvidenceSpan[] = [];
        const rawEvidence = Array.isArray(rawItem.evidence) ? rawItem.evidence : [];
        const verifiedSpans = verifiedByPath.get(itemPath) ?? [];
        rawEvidence.forEach((rawSpan, spanIndex) => {
          if (!isRecord(rawSpan) || typeof rawSpan.quote !== "string") return;
          const quote = (rawSpan.quote as string).normalize("NFC");
          const occurrences = findQuoteOccurrences(bodyNormalized, quote);
          const verified = verifiedSpans[spanIndex];
          evidenceSpans.push({
            quote,
            startOffset: verified ? verified.start_offset : -1,
            endOffset: verified ? verified.end_offset : -1,
            occurrences,
            ambiguous: occurrences.length > 1,
            chosenOccurrence: null,
          });
        });
        items.push({
          id: itemPath,
          section,
          localId: typeof rawItem.local_id === "string" ? rawItem.local_id : null,
          data: rawItem,
          evidence: evidenceSpans,
          status: "pending",
          rejectReason: null,
          verificationError:
            rejectedByPath.get(itemPath) ??
            (section === "propositions" && rawItem.modality !== undefined && rawItem.modality !== "asserted"
              ? `modality ${JSON.stringify(rawItem.modality)}: not committable as an asserted world fact; reject it`
              : null),
          targetPromiseId: null,
          resolutionConflict: null,
          resolutionConflictConfirmed: false,
        });
      });
    }

    const batch: ReviewBatch = {
      id: randomUUID(),
      fixtureId: input.fixtureId ?? null,
      chapterSeq: input.chapterSeq ?? null,
      chapterRevisionId: input.chapterRevisionId ?? null,
      bodyNormalized,
      bodySha256,
      items,
      createdAt: new Date().toISOString(),
      ...(input.requireModality === true ? { requireModality: true } : {}),
    };
    this.batches.set(batch.id, batch);
    return batch;
  }

  /**
   * M1.1 item 3: add an explicit record that a character does not know
   * a proposition at a given event. The denial is a pending review
   * item like any other: its evidence is verified against the chapter
   * body (canonical offsets come from the verifier), at least one span
   * is required, and acceptance is blocked while a quote is unverified
   * or ambiguous. The item id is a stable `$.knowledge_denials[N]`
   * path; the proposition and stated-at event are local ids resolved
   * at commit time.
   */
  addKnowledgeDenial(
    batchId: string,
    input: {
      character: string;
      propositionLocalId: string;
      statedAtEventLocalId: string;
      evidence: Array<{ quote: string; startOffset: number; endOffset: number }>;
    },
  ): ReviewItem {
    const batch = this.getBatch(batchId);
    if (typeof input.character !== "string" || input.character.trim().length === 0) {
      throw new ReviewError("VALIDATION_FAILED", "denial character must be a non-empty string");
    }
    if (typeof input.propositionLocalId !== "string" || input.propositionLocalId.trim().length === 0) {
      throw new ReviewError("VALIDATION_FAILED", "denial proposition_local_id must be a non-empty string");
    }
    if (typeof input.statedAtEventLocalId !== "string" || input.statedAtEventLocalId.trim().length === 0) {
      throw new ReviewError(
        "VALIDATION_FAILED",
        "denial stated_at_event_local_id must be a non-empty string",
      );
    }
    if (!Array.isArray(input.evidence) || input.evidence.length === 0) {
      throw new ReviewError("VALIDATION_FAILED", "a denial needs at least one evidence span");
    }
    const evidenceSpans: ReviewEvidenceSpan[] = [];
    let verificationError: string | null = null;
    for (const rawSpan of input.evidence) {
      if (!isRecord(rawSpan) || typeof rawSpan.quote !== "string") {
        if (verificationError === null) verificationError = "evidence span is malformed";
        continue;
      }
      const quote = rawSpan.quote.normalize("NFC");
      const occurrences = findQuoteOccurrences(batch.bodyNormalized, quote);
      const verdict = verifyEvidenceSpan(batch.bodyNormalized, {
        quote: rawSpan.quote,
        start_offset: typeof rawSpan.startOffset === "number" ? rawSpan.startOffset : -1,
        end_offset: typeof rawSpan.endOffset === "number" ? rawSpan.endOffset : -1,
      });
      if (!verdict.ok) {
        if (verificationError === null) {
          verificationError = `${verdict.reason}: ${JSON.stringify(verdict.quote)}`;
        }
        evidenceSpans.push({
          quote,
          startOffset: -1,
          endOffset: -1,
          occurrences,
          ambiguous: occurrences.length > 1,
          chosenOccurrence: null,
        });
      } else {
        evidenceSpans.push({
          quote: verdict.quote,
          startOffset: verdict.start_offset,
          endOffset: verdict.end_offset,
          occurrences,
          ambiguous: occurrences.length > 1,
          chosenOccurrence: null,
        });
      }
    }
    const index = batch.items.filter((i) => i.section === "knowledge_denials").length;
    const item: ReviewItem = {
      id: `$.knowledge_denials[${index}]`,
      section: "knowledge_denials",
      localId: null,
      data: {
        character: input.character,
        proposition_local_id: input.propositionLocalId,
        stated_at_event_local_id: input.statedAtEventLocalId,
        evidence: input.evidence,
      },
      evidence: evidenceSpans,
      status: "pending",
      rejectReason: null,
      verificationError,
      targetPromiseId: null,
      resolutionConflict: null,
      resolutionConflictConfirmed: false,
    };
    batch.items.push(item);
    return item;
  }

  getBatch(batchId: string): ReviewBatch {
    const batch = this.batches.get(batchId);
    if (!batch) throw new ReviewError("NOT_FOUND", `unknown review batch ${batchId}`);
    return batch;
  }

  listBatches(): ReviewBatch[] {
    return [...this.batches.values()];
  }

  private getItem(batchId: string, itemId: string): ReviewItem {
    const batch = this.getBatch(batchId);
    const item = batch.items.find((i) => i.id === itemId);
    if (!item) throw new ReviewError("NOT_FOUND", `unknown review item ${itemId} in batch ${batchId}`);
    return item;
  }

  /** Accept one item. Blocked while evidence is unverified or ambiguous. */
  accept(batchId: string, itemId: string): ReviewItem {
    const item = this.getItem(batchId, itemId);
    if (item.status !== "pending") {
      throw new ReviewError("ALREADY_DECIDED", `item ${itemId} is already ${item.status}`);
    }
    if (item.verificationError !== null) {
      throw new ReviewError(
        "EVIDENCE_NOT_VERIFIED",
        `item ${itemId} cannot be accepted: ${item.verificationError}`,
      );
    }
    const unresolved = item.evidence.find((s) => s.ambiguous && s.chosenOccurrence === null);
    if (unresolved) {
      throw new ReviewError(
        "AMBIGUOUS_EVIDENCE",
        `item ${itemId} has an ambiguous quote ${JSON.stringify(unresolved.quote)}; ` +
          `choose one occurrence explicitly before accepting`,
      );
    }
    // M1.1 item 2: a resolution candidate cannot be accepted until the
    // reviewer has chosen its target promise, and resolving an
    // already-resolved promise needs an explicit confirmation.
    if (this.isResolutionCandidate(item)) {
      if (item.targetPromiseId === null) {
        throw new ReviewError(
          "VALIDATION_FAILED",
          `item ${itemId} is a promise resolution with no target promise; ` +
            `select a target promise before accepting`,
        );
      }
      if (item.resolutionConflict !== null && !item.resolutionConflictConfirmed) {
        throw new ReviewError(
          "VALIDATION_FAILED",
          `item ${itemId} resolves promise ${item.targetPromiseId}, which is already ` +
            `${item.resolutionConflict.previousStatus}; confirm the resolution conflict before accepting`,
        );
      }
    }
    item.status = "accepted";
    return item;
  }

  /** True for a `promises` item whose status_change resolves rather than raises. */
  private isResolutionCandidate(item: ReviewItem): boolean {
    if (item.section !== "promises") return false;
    const statusChange = item.data.status_change;
    return statusChange === "fulfilled" || statusChange === "violated" || statusChange === "abandoned";
  }

  /**
   * M1.1 item 2: the reviewer picks the target promise for a
   * resolution candidate, choosing from the current projection (the
   * caller supplies the candidate list: real promise ids with their
   * current status). The choice is stored on the review item; no
   * automatic matching is ever done. Re-selecting replaces the
   * choice (and recomputes the conflict). Choosing an already
   * resolved promise records the conflict; acceptance then needs
   * `confirmResolutionConflict`.
   */
  selectPromiseTarget(
    batchId: string,
    itemId: string,
    targetPromiseId: string,
    candidates: Array<{ id: string; currentStatus: PromiseStatus }>,
  ): ReviewItem {
    const item = this.getItem(batchId, itemId);
    if (item.status !== "pending") {
      throw new ReviewError("ALREADY_DECIDED", `item ${itemId} is already ${item.status}`);
    }
    if (!this.isResolutionCandidate(item)) {
      throw new ReviewError(
        "VALIDATION_FAILED",
        `item ${itemId} is not a promise resolution candidate; only resolution candidates take a target promise`,
      );
    }
    const candidate = candidates.find((c) => c.id === targetPromiseId);
    if (!candidate) {
      throw new ReviewError(
        "VALIDATION_FAILED",
        `unknown target promise ${targetPromiseId} (not in the current projection)`,
      );
    }
    item.targetPromiseId = targetPromiseId;
    if (candidate.currentStatus !== "open") {
      item.resolutionConflict = {
        targetPromiseId,
        previousStatus: candidate.currentStatus,
      };
      item.resolutionConflictConfirmed = false;
    } else {
      item.resolutionConflict = null;
      item.resolutionConflictConfirmed = false;
    }
    return item;
  }

  /**
   * M1.1 item 2: reviewer confirmation for resolving an
   * already-resolved promise. Required before acceptance when
   * `resolutionConflict` is set.
   */
  confirmResolutionConflict(batchId: string, itemId: string): ReviewItem {
    const item = this.getItem(batchId, itemId);
    if (item.status !== "pending") {
      throw new ReviewError("ALREADY_DECIDED", `item ${itemId} is already ${item.status}`);
    }
    if (item.resolutionConflict === null) {
      throw new ReviewError(
        "VALIDATION_FAILED",
        `item ${itemId} has no resolution conflict to confirm`,
      );
    }
    item.resolutionConflictConfirmed = true;
    return item;
  }

  /** Reject one item, keeping the reason. Allowed even for unverified items. */
  reject(batchId: string, itemId: string, reason: string): ReviewItem {
    const item = this.getItem(batchId, itemId);
    if (item.status !== "pending") {
      throw new ReviewError("ALREADY_DECIDED", `item ${itemId} is already ${item.status}`);
    }
    if (typeof reason !== "string" || reason.trim().length === 0) {
      throw new ReviewError("VALIDATION_FAILED", "a reject reason is required");
    }
    item.status = "rejected";
    item.rejectReason = reason;
    return item;
  }

  /**
   * Record a human's explicit choice of occurrence for an ambiguous
   * quote. The choice must be one of the found occurrences; the span's
   * offsets become the chosen occurrence's offsets.
   */
  resolveAmbiguity(
    batchId: string,
    itemId: string,
    evidenceIndex: number,
    occurrenceIndex: number,
  ): ReviewItem {
    const item = this.getItem(batchId, itemId);
    if (item.status !== "pending") {
      throw new ReviewError("ALREADY_DECIDED", `item ${itemId} is already ${item.status}`);
    }
    const span = item.evidence[evidenceIndex];
    if (!span) throw new ReviewError("NOT_FOUND", `no evidence span ${evidenceIndex} on item ${itemId}`);
    if (!span.ambiguous) {
      throw new ReviewError("VALIDATION_FAILED", `evidence span ${evidenceIndex} is not ambiguous`);
    }
    const chosen = span.occurrences[occurrenceIndex];
    if (!chosen) {
      throw new ReviewError(
        "VALIDATION_FAILED",
        `occurrence ${occurrenceIndex} does not exist (found ${span.occurrences.length})`,
      );
    }
    span.chosenOccurrence = chosen;
    span.startOffset = chosen[0];
    span.endOffset = chosen[1];
    return item;
  }

  pendingItems(batchId: string): ReviewItem[] {
    return this.getBatch(batchId).items.filter((i) => i.status === "pending");
  }

  acceptedItems(batchId: string): ReviewItem[] {
    return this.getBatch(batchId).items.filter((i) => i.status === "accepted");
  }

  rejectedItems(batchId: string): ReviewItem[] {
    return this.getBatch(batchId).items.filter((i) => i.status === "rejected");
  }
}
