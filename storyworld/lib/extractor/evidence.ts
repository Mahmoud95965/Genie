/**
 * Evidence verification (M0) — spec section 6.5.
 *
 * Offsets are 0-based, end-exclusive, counted in Unicode code points over
 * the NFC-normalized body (`body_normalized`). The orchestrator, not the
 * model, computes canonical offsets:
 * - Unique match: offsets are recomputed; the model's values are advisory.
 * - Multiple matches: the model's offsets must select one occurrence whose
 *   slice equals the quote, otherwise the item is rejected.
 * - No match: rejected.
 *
 * JavaScript strings are UTF-16, so code-point offsets are converted to
 * UTF-16 code-unit indices before slicing. Only code points are stored
 * and transmitted.
 */

/** NFC-normalize a chapter body (the stored `body_normalized`). */
export function normalizeBody(body: string): string {
  return body.normalize("NFC");
}

export interface EvidenceSpan {
  quote: string;
  start_offset: number;
  end_offset: number;
}

/**
 * Convert a 0-based code-point offset to a UTF-16 code-unit index.
 * Throws on out-of-range offsets.
 */
export function codePointToUtf16Index(text: string, cpOffset: number): number {
  if (!Number.isInteger(cpOffset) || cpOffset < 0) {
    throw new RangeError(`code-point offset out of range: ${cpOffset}`);
  }
  let cp = 0;
  for (let i = 0; i < text.length; ) {
    if (cp === cpOffset) return i;
    const code = text.codePointAt(i);
    if (code === undefined) break;
    i += code > 0xffff ? 2 : 1;
    cp += 1;
  }
  if (cp === cpOffset) return text.length;
  throw new RangeError(`code-point offset out of range: ${cpOffset} (length ${cp})`);
}

/** Convert a UTF-16 code-unit index to a 0-based code-point offset. */
export function utf16ToCodePointIndex(text: string, utf16Index: number): number {
  if (!Number.isInteger(utf16Index) || utf16Index < 0 || utf16Index > text.length) {
    throw new RangeError(`UTF-16 index out of range: ${utf16Index}`);
  }
  let cp = 0;
  for (let i = 0; i < utf16Index; ) {
    const code = text.codePointAt(i);
    if (code === undefined) break;
    i += code > 0xffff ? 2 : 1;
    cp += 1;
  }
  return cp;
}

/** Slice `text` by code-point offsets [start, end). */
export function sliceByCodePoints(text: string, startCp: number, endCp: number): string {
  const start = codePointToUtf16Index(text, startCp);
  const end = codePointToUtf16Index(text, endCp);
  return text.slice(start, end);
}

/** Count code points in a string. */
export function codePointLength(text: string): number {
  return [...text].length;
}

/** Find every occurrence of `quote` in `body` as code-point [start, end) spans. */
export function findQuoteOccurrences(bodyNormalized: string, quoteNormalized: string): Array<[number, number]> {
  const occurrences: Array<[number, number]> = [];
  if (quoteNormalized.length === 0) return occurrences;
  let from = 0;
  for (;;) {
    const idx = bodyNormalized.indexOf(quoteNormalized, from);
    if (idx === -1) break;
    const startCp = utf16ToCodePointIndex(bodyNormalized, idx);
    const endCp = startCp + codePointLength(quoteNormalized);
    occurrences.push([startCp, endCp]);
    from = idx + 1;
  }
  return occurrences;
}

export type EvidenceVerdict =
  | { ok: true; quote: string; start_offset: number; end_offset: number }
  | { ok: false; quote: string; reason: "quote_not_found" | "ambiguous_quote" | "offset_mismatch" };

/**
 * Verify one evidence span against the normalized body.
 * Returns the canonical offsets on success; rejects otherwise.
 */
export function verifyEvidenceSpan(
  bodyNormalized: string,
  span: EvidenceSpan,
): EvidenceVerdict {
  const quote = span.quote.normalize("NFC");
  const occurrences = findQuoteOccurrences(bodyNormalized, quote);
  if (occurrences.length === 0) {
    return { ok: false, quote, reason: "quote_not_found" };
  }
  if (occurrences.length === 1) {
    const [start, end] = occurrences[0];
    return { ok: true, quote, start_offset: start, end_offset: end };
  }
  // Ambiguous: the model's offsets must select one occurrence whose slice
  // equals the quote.
  const selected = occurrences.find(
    ([start, end]) => start === span.start_offset && end === span.end_offset,
  );
  if (!selected) {
    return { ok: false, quote, reason: "ambiguous_quote" };
  }
  if (sliceByCodePoints(bodyNormalized, selected[0], selected[1]) !== quote) {
    return { ok: false, quote, reason: "offset_mismatch" };
  }
  return { ok: true, quote, start_offset: selected[0], end_offset: selected[1] };
}

export interface VerifiedItem {
  /** Dotted path of the item inside the extraction, e.g. `$.events[0]`. */
  itemPath: string;
  spans: Array<{ quote: string; start_offset: number; end_offset: number }>;
}

export interface RejectedItem {
  itemPath: string;
  reason: string;
}

export interface ExtractionVerification {
  ok: boolean;
  verified: VerifiedItem[];
  rejected: RejectedItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Verify every evidence span in an extractor output against the chapter
 * body. The body is NFC-normalized here; callers pass the raw body.
 */
export function verifyExtraction(body: string, output: unknown): ExtractionVerification {
  const bodyNormalized = normalizeBody(body);
  const verified: VerifiedItem[] = [];
  const rejected: RejectedItem[] = [];
  if (!isRecord(output)) {
    return { ok: false, verified, rejected: [{ itemPath: "$", reason: "output is not an object" }] };
  }
  const sections: Array<[string, unknown]> = [
    ["propositions", output.propositions],
    ["events", output.events],
    ["knowledge", output.knowledge],
    ["character_facts", output.character_facts],
    ["promises", output.promises],
  ];
  for (const [section, items] of sections) {
    if (!Array.isArray(items)) continue;
    items.forEach((item, i) => {
      const itemPath = `$.${section}[${i}]`;
      if (!isRecord(item) || !Array.isArray(item.evidence)) {
        rejected.push({ itemPath, reason: "item has no evidence array" });
        return;
      }
      const spans: VerifiedItem["spans"] = [];
      let itemOk = true;
      (item.evidence as unknown[]).forEach((rawSpan) => {
        if (!isRecord(rawSpan) || typeof rawSpan.quote !== "string") {
          itemOk = false;
          rejected.push({ itemPath, reason: "evidence span is malformed" });
          return;
        }
        const span: EvidenceSpan = {
          quote: rawSpan.quote,
          start_offset: typeof rawSpan.start_offset === "number" ? rawSpan.start_offset : -1,
          end_offset: typeof rawSpan.end_offset === "number" ? rawSpan.end_offset : -1,
        };
        const verdict = verifyEvidenceSpan(bodyNormalized, span);
        if (!verdict.ok) {
          itemOk = false;
          rejected.push({ itemPath, reason: `${verdict.reason}: ${JSON.stringify(verdict.quote)}` });
        } else {
          spans.push({
            quote: verdict.quote,
            start_offset: verdict.start_offset,
            end_offset: verdict.end_offset,
          });
        }
      });
      if (itemOk) verified.push({ itemPath, spans });
    });
  }
  return { ok: rejected.length === 0, verified, rejected };
}
