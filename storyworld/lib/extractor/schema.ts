/**
 * `GenieExtractorOutput` JSON schema (M0).
 *
 * Transcribed exactly from spec section 6.1. Strict-mode shape: every
 * object declares `additionalProperties: false` and lists every property
 * in `required`; nullable objects use `anyOf` with an explicit `null`
 * branch. Used both as the OpenRouter `response_format` (json_schema,
 * strict) and as the reference for the hand-written validator in
 * `validate.ts`.
 */

export const GENIE_EXTRACTOR_OUTPUT_SCHEMA = {
  title: "GenieExtractorOutput",
  type: "object",
  additionalProperties: false,
  required: ["propositions", "events", "knowledge", "character_facts", "promises"],
  properties: {
    propositions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["local_id", "statement", "evidence"],
        properties: {
          local_id: { type: "string" },
          statement: { type: "string" },
          evidence: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["quote", "start_offset", "end_offset"],
              properties: {
                quote: { type: "string" },
                start_offset: { type: "integer" },
                end_offset: { type: "integer" },
              },
            },
          },
        },
      },
    },
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
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
        properties: {
          local_id: { type: "string" },
          kind: {
            type: "string",
            enum: [
              "death",
              "action",
              "dialogue",
              "knowledge_transfer",
              "knowledge_use",
              "movement",
              "observation",
              "promise_raised",
              "other",
            ],
          },
          summary: { type: "string" },
          participants: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["character", "role"],
              properties: {
                character: { type: "string" },
                role: {
                  type: "string",
                  enum: ["actor", "victim", "speaker", "listener", "observer", "subject"],
                },
              },
            },
          },
          location: { type: ["string", "null"] },
          story_time: { type: ["string", "null"] },
          span_start: { type: ["integer", "null"] },
          span_end: { type: ["integer", "null"] },
          reality_scope: {
            type: "string",
            enum: ["real", "dream", "vision", "unreliable_account", "hypothetical"],
          },
          certainty: { type: "string", enum: ["asserted", "ambiguous", "false_in_world"] },
          evidence: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["quote", "start_offset", "end_offset"],
              properties: {
                quote: { type: "string" },
                start_offset: { type: "integer" },
                end_offset: { type: "integer" },
              },
            },
          },
          knowledge_transfer: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["proposition_local_id", "from_character", "to_characters", "how"],
                properties: {
                  proposition_local_id: { type: "string" },
                  from_character: { type: ["string", "null"] },
                  to_characters: { type: "array", minItems: 1, items: { type: "string" } },
                  how: { type: "string", enum: ["witnessed", "told", "inferred", "other"] },
                },
              },
              { type: "null" },
            ],
          },
          knowledge_use: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["character", "proposition_local_id"],
                properties: {
                  character: { type: "string" },
                  proposition_local_id: { type: "string" },
                },
              },
              { type: "null" },
            ],
          },
        },
      },
    },
    knowledge: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "character",
          "proposition_local_id",
          "learned_how",
          "certainty",
          "learned_at_event_local_id",
          "evidence",
        ],
        properties: {
          character: { type: "string" },
          proposition_local_id: { type: "string" },
          learned_how: { type: "string", enum: ["witnessed", "told", "inferred", "other"] },
          certainty: { type: "string", enum: ["asserted", "suspected", "false_belief"] },
          learned_at_event_local_id: { type: "string" },
          evidence: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["quote", "start_offset", "end_offset"],
              properties: {
                quote: { type: "string" },
                start_offset: { type: "integer" },
                end_offset: { type: "integer" },
              },
            },
          },
        },
      },
    },
    character_facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["character", "kind", "value", "valid_from_event_local_id", "evidence"],
        properties: {
          character: { type: "string" },
          kind: { type: "string", enum: ["alive", "dead", "location", "trait", "relationship"] },
          value: { type: "string" },
          valid_from_event_local_id: { type: "string" },
          evidence: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["quote", "start_offset", "end_offset"],
              properties: {
                quote: { type: "string" },
                start_offset: { type: "integer" },
                end_offset: { type: "integer" },
              },
            },
          },
        },
      },
    },
    promises: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "description",
          "raised_at_event_local_id",
          "deadline_event_local_id",
          "deadline_condition",
          "status_change",
          "resolved_at_event_local_id",
          "evidence",
        ],
        properties: {
          description: { type: "string" },
          raised_at_event_local_id: { type: "string" },
          deadline_event_local_id: { type: ["string", "null"] },
          deadline_condition: { type: ["string", "null"] },
          status_change: { type: "string", enum: ["raised", "fulfilled", "violated", "abandoned"] },
          resolved_at_event_local_id: { type: ["string", "null"] },
          evidence: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["quote", "start_offset", "end_offset"],
              properties: {
                quote: { type: "string" },
                start_offset: { type: "integer" },
                end_offset: { type: "integer" },
              },
            },
          },
        },
      },
    },
  }
} as const;
