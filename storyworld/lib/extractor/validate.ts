/**
 * Hand-written structural validator for `GenieExtractorOutput` (M0).
 *
 * No runtime dependency: checks required fields, exact key sets (strict
 * mode — no additional properties), types, enums, and `minItems: 1` on
 * evidence arrays, mirroring the schema in `schema.ts` (spec 6.1).
 * Returns every problem found so the worker can report / retry with the
 * validator error appended (spec section 4, step 2).
 */

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
}

const EVENT_KINDS = [
  "death",
  "action",
  "dialogue",
  "knowledge_transfer",
  "knowledge_use",
  "movement",
  "observation",
  "promise_raised",
  "other",
];
const PARTICIPANT_ROLES = ["actor", "victim", "speaker", "listener", "observer", "subject"];
const REALITY_SCOPES = ["real", "dream", "vision", "unreliable_account", "hypothetical"];
const EVENT_CERTAINTIES = ["asserted", "ambiguous", "false_in_world"];
const LEARNED_HOWS = ["witnessed", "told", "inferred", "other"];
const KNOWLEDGE_CERTAINTIES = ["asserted", "suspected", "false_belief"];
const FACT_KINDS = ["alive", "dead", "location", "trait", "relationship"];
const PROMISE_STATUSES = ["raised", "fulfilled", "violated", "abandoned"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isIntegerOrNull(value: unknown): value is number | null {
  return isInteger(value) || value === null;
}

class Checker {
  errors: ValidationIssue[] = [];

  at(path: string, message: string): void {
    this.errors.push({ path, message });
  }

  /** Strict object: exact required keys, no additional properties. */
  object(value: unknown, required: string[], path: string): Record<string, unknown> | null {
    if (!isRecord(value)) {
      this.at(path, "must be an object");
      return null;
    }
    for (const key of required) {
      if (!(key in value)) this.at(`${path}.${key}`, "missing required property");
    }
    for (const key of Object.keys(value)) {
      if (!required.includes(key)) this.at(`${path}.${key}`, "additional property not allowed");
    }
    return value;
  }

  string(value: unknown, path: string): void {
    if (typeof value !== "string") this.at(path, "must be a string");
  }

  enum(value: unknown, allowed: string[], path: string): void {
    if (typeof value !== "string" || !allowed.includes(value)) {
      this.at(path, `must be one of: ${allowed.join(", ")}`);
    }
  }

  array(value: unknown, path: string): unknown[] | null {
    if (!Array.isArray(value)) {
      this.at(path, "must be an array");
      return null;
    }
    return value;
  }

  evidence(value: unknown, path: string): void {
    const items = this.array(value, path);
    if (!items) return;
    if (items.length < 1) this.at(path, "must contain at least 1 item");
    items.forEach((item, i) => {
      const span = this.object(item, ["quote", "start_offset", "end_offset"], `${path}[${i}]`);
      if (!span) return;
      this.string(span.quote, `${path}[${i}].quote`);
      if (!isInteger(span.start_offset)) this.at(`${path}[${i}].start_offset`, "must be an integer");
      if (!isInteger(span.end_offset)) this.at(`${path}[${i}].end_offset`, "must be an integer");
      if (isInteger(span.start_offset) && isInteger(span.end_offset) && span.end_offset <= span.start_offset) {
        this.at(`${path}[${i}]`, "end_offset must be greater than start_offset");
      }
    });
  }
}

/** Validate an unknown value as a `GenieExtractorOutput` object. */
const MODALITIES = ["asserted", "promised", "intended", "reported", "hypothetical"];

/**
 * `opts.requireModality` (extractor.v4): every proposition must carry a valid
 * `modality`. Default (v3 and legacy fixtures): `modality` is optional, and an
 * absent value means asserted. An invalid value is always an error.
 */
export function validateExtractorOutput(value: unknown, opts: { requireModality?: boolean } = {}): ValidationResult {
  const c = new Checker();
  const root = c.object(
    value,
    ["propositions", "events", "knowledge", "character_facts", "promises"],
    "$",
  );
  if (!root) return { valid: false, errors: c.errors };

  const propositions = c.array(root.propositions, "$.propositions") ?? [];
  propositions.forEach((item, i) => {
    const hasModality = isRecord(item) && "modality" in item;
    if (opts.requireModality && isRecord(item) && !hasModality) c.at(`$.propositions[${i}].modality`, "missing required property");
    const p = c.object(
      item,
      hasModality ? ["local_id", "statement", "evidence", "modality"] : ["local_id", "statement", "evidence"],
      `$.propositions[${i}]`,
    );
    if (!p) return;
    if (hasModality) c.enum(p.modality, MODALITIES, `$.propositions[${i}].modality`);
    c.string(p.local_id, `$.propositions[${i}].local_id`);
    c.string(p.statement, `$.propositions[${i}].statement`);
    c.evidence(p.evidence, `$.propositions[${i}].evidence`);
  });

  const events = c.array(root.events, "$.events") ?? [];
  events.forEach((item, i) => {
    const path = `$.events[${i}]`;
    const e = c.object(
      item,
      [
        "local_id",
        "kind",
        "summary",
        "participants",
        "location",
        "story_time",
        "span_start",
        "span_end",
        "reality_scope",
        "certainty",
        "evidence",
        "knowledge_transfer",
        "knowledge_use",
      ],
      path,
    );
    if (!e) return;
    c.string(e.local_id, `${path}.local_id`);
    c.enum(e.kind, EVENT_KINDS, `${path}.kind`);
    c.string(e.summary, `${path}.summary`);
    const participants = c.array(e.participants, `${path}.participants`) ?? [];
    participants.forEach((part, j) => {
      const pp = c.object(part, ["character", "role"], `${path}.participants[${j}]`);
      if (!pp) return;
      c.string(pp.character, `${path}.participants[${j}].character`);
      c.enum(pp.role, PARTICIPANT_ROLES, `${path}.participants[${j}].role`);
    });
    if (!isStringOrNull(e.location)) c.at(`${path}.location`, "must be a string or null");
    if (!isStringOrNull(e.story_time)) c.at(`${path}.story_time`, "must be a string or null");
    if (!isIntegerOrNull(e.span_start)) c.at(`${path}.span_start`, "must be an integer or null");
    if (!isIntegerOrNull(e.span_end)) c.at(`${path}.span_end`, "must be an integer or null");
    c.enum(e.reality_scope, REALITY_SCOPES, `${path}.reality_scope`);
    c.enum(e.certainty, EVENT_CERTAINTIES, `${path}.certainty`);
    c.evidence(e.evidence, `${path}.evidence`);
    if (e.knowledge_transfer !== null) {
      const kt = c.object(
        e.knowledge_transfer,
        ["proposition_local_id", "from_character", "to_characters", "how"],
        `${path}.knowledge_transfer`,
      );
      if (kt) {
        c.string(kt.proposition_local_id, `${path}.knowledge_transfer.proposition_local_id`);
        if (!isStringOrNull(kt.from_character)) {
          c.at(`${path}.knowledge_transfer.from_character`, "must be a string or null");
        }
        const to = c.array(kt.to_characters, `${path}.knowledge_transfer.to_characters`) ?? [];
        if (to.length < 1) c.at(`${path}.knowledge_transfer.to_characters`, "must contain at least 1 item");
        to.forEach((t, k) => c.string(t, `${path}.knowledge_transfer.to_characters[${k}]`));
        c.enum(kt.how, LEARNED_HOWS, `${path}.knowledge_transfer.how`);
      }
    }
    if (e.knowledge_use !== null) {
      const ku = c.object(
        e.knowledge_use,
        ["character", "proposition_local_id"],
        `${path}.knowledge_use`,
      );
      if (ku) {
        c.string(ku.character, `${path}.knowledge_use.character`);
        c.string(ku.proposition_local_id, `${path}.knowledge_use.proposition_local_id`);
      }
    }
  });

  const knowledge = c.array(root.knowledge, "$.knowledge") ?? [];
  knowledge.forEach((item, i) => {
    const path = `$.knowledge[${i}]`;
    const k = c.object(
      item,
      [
        "character",
        "proposition_local_id",
        "learned_how",
        "certainty",
        "learned_at_event_local_id",
        "evidence",
      ],
      path,
    );
    if (!k) return;
    c.string(k.character, `${path}.character`);
    c.string(k.proposition_local_id, `${path}.proposition_local_id`);
    c.enum(k.learned_how, LEARNED_HOWS, `${path}.learned_how`);
    c.enum(k.certainty, KNOWLEDGE_CERTAINTIES, `${path}.certainty`);
    c.string(k.learned_at_event_local_id, `${path}.learned_at_event_local_id`);
    c.evidence(k.evidence, `${path}.evidence`);
  });

  const facts = c.array(root.character_facts, "$.character_facts") ?? [];
  facts.forEach((item, i) => {
    const path = `$.character_facts[${i}]`;
    const f = c.object(
      item,
      ["character", "kind", "value", "valid_from_event_local_id", "evidence"],
      path,
    );
    if (!f) return;
    c.string(f.character, `${path}.character`);
    c.enum(f.kind, FACT_KINDS, `${path}.kind`);
    c.string(f.value, `${path}.value`);
    c.string(f.valid_from_event_local_id, `${path}.valid_from_event_local_id`);
    c.evidence(f.evidence, `${path}.evidence`);
  });

  const promises = c.array(root.promises, "$.promises") ?? [];
  promises.forEach((item, i) => {
    const path = `$.promises[${i}]`;
    const p = c.object(
      item,
      [
        "description",
        "raised_at_event_local_id",
        "deadline_event_local_id",
        "deadline_condition",
        "status_change",
        "resolved_at_event_local_id",
        "evidence",
      ],
      path,
    );
    if (!p) return;
    c.string(p.description, `${path}.description`);
    c.string(p.raised_at_event_local_id, `${path}.raised_at_event_local_id`);
    if (!isStringOrNull(p.deadline_event_local_id)) {
      c.at(`${path}.deadline_event_local_id`, "must be a string or null");
    }
    if (!isStringOrNull(p.deadline_condition)) {
      c.at(`${path}.deadline_condition`, "must be a string or null");
    }
    c.enum(p.status_change, PROMISE_STATUSES, `${path}.status_change`);
    if (!isStringOrNull(p.resolved_at_event_local_id)) {
      c.at(`${path}.resolved_at_event_local_id`, "must be a string or null");
    }
    c.evidence(p.evidence, `${path}.evidence`);
  });

  return { valid: c.errors.length === 0, errors: c.errors };
}
