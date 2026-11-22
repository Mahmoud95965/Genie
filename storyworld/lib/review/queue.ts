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
  verifyExtraction,
} from "../extractor/evidence";
import { validateExtractorOutput } from "../extractor/validate";

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

export type ReviewSection = "propositions" | "events" | "knowledge" | "character_facts" | "promises";
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
}

export interface CreateBatchInput {
  body: string;
  /** Validated extractor output (a `GenieExtractorOutput` object). */
  output: unknown;
  chapterRevisionId?: string | null;
  fixtureId?: string | null;
  chapterSeq?: number | null;
}

const SECTIONS: ReviewSection[] = ["propositions", "events", "knowledge", "character_facts", "promises"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class ReviewQueue {
  private batches = new Map<string, ReviewBatch>();

  /** Validate + verify an extraction and turn it into reviewable items. */
  createBatch(input: CreateBatchInput): ReviewBatch {
    const validation = validateExtractorOutput(input.output);
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
          verificationError: rejectedByPath.get(itemPath) ?? null,
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
    };
    this.batches.set(batch.id, batch);
    return batch;
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
    item.status = "accepted";
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
