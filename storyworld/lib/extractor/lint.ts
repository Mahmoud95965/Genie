/**
 * Offline, NON-GATING lint over a schema-valid extraction (candidate for
 * version v2 tooling; 2026-11-24).
 *
 * Why it exists: the schema has no modality field on `propositions`, so the
 * extractor.v3 prompt rule "a promise is not an asserted fact" cannot be
 * enforced by schema or validator. This lint surfaces likely violations as
 * warnings for review/scoring. It never rejects or edits output, makes no
 * model call, and is heuristic (false positives/negatives expected).
 */

export interface LintWarning {
  code: "PROPOSITION_OVERLAPS_PROMISE" | "PROPOSITION_HAS_INTENT_MARKER" | "CAST_MEMBER_NOT_COVERED" | "NO_PROPOSITIONS";
  path: string;
  detail: string;
}

type Obj = Record<string, unknown>;

// Egyptian/MSA intent or promise cue words. Heuristic list, extend with evidence only.
const INTENT_MARKERS = ["ناوي", "ناوية", "ناويين", "وعد", "وعدته", "وعده", "وعدها", "هيعلم", "هيرجع", "هيجيب", "عازم", "promise", "promised", "plans to", "intends"];

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function quotesOf(item: unknown): string[] {
  const ev = (item as Obj | null)?.evidence;
  if (!Array.isArray(ev)) return [];
  return ev.map((e) => (typeof (e as Obj)?.quote === "string" ? norm((e as Obj).quote as string) : "")).filter(Boolean);
}

export function lintExtraction(output: unknown, cast: string[] = []): LintWarning[] {
  const warnings: LintWarning[] = [];
  const root = (output ?? {}) as Obj;
  const props = Array.isArray(root.propositions) ? root.propositions : [];
  const promises = Array.isArray(root.promises) ? root.promises : [];
  const events = Array.isArray(root.events) ? root.events : [];
  const facts = Array.isArray(root.character_facts) ? root.character_facts : [];

  if (props.length === 0) {
    warnings.push({ code: "NO_PROPOSITIONS", path: "$.propositions", detail: "no propositions: background world facts not extracted" });
  }

  const promiseQuotes = [
    ...promises.flatMap(quotesOf),
    ...events.filter((e) => (e as Obj)?.kind === "promise_raised").flatMap(quotesOf),
  ];

  props.forEach((p, i) => {
    const path = `$.propositions[${i}]`;
    const statement = String((p as Obj)?.statement ?? "");
    for (const q of quotesOf(p)) {
      if (promiseQuotes.some((pq) => pq.includes(q) || q.includes(pq))) {
        warnings.push({ code: "PROPOSITION_OVERLAPS_PROMISE", path, detail: `evidence overlaps a promise quote; check the statement is not asserted as fact: ${statement}` });
        return;
      }
    }
    const hay = [statement, ...quotesOf(p)].join(" ");
    const hit = INTENT_MARKERS.find((m) => hay.includes(m));
    if (hit) {
      warnings.push({ code: "PROPOSITION_HAS_INTENT_MARKER", path, detail: `contains intent/promise cue "${hit}": ${statement}` });
    }
  });

  const named = new Set<string>();
  for (const f of facts) named.add(String((f as Obj)?.character ?? ""));
  for (const e of events) {
    const parts = Array.isArray((e as Obj)?.participants) ? ((e as Obj).participants as unknown[]) : [];
    for (const pt of parts) named.add(String((pt as Obj)?.character ?? ""));
  }
  for (const c of cast) {
    if (!named.has(c)) warnings.push({ code: "CAST_MEMBER_NOT_COVERED", path: "$", detail: `cast member "${c}" has no character_facts or event participation` });
  }
  return warnings;
}
