# Gemini smoke fixture (2026-11-23)

First successful live extraction through the Gemini path. Replay offline: set
`live_calls.enabled: false` and pass `--recording-key gemini-3.6-flash-smoke`
(or `--model gemini-3.6-flash-smoke`).

## Request parameters that produced this output

The runner now emits exactly these on the gemini path (tested offline against
a mocked fetch; this smoke itself was sent with a hand-built equivalent):

- Endpoint: OpenAI-compatible `POST {baseUrl}/chat/completions` at
  `https://generativelanguage.googleapis.com/v1beta/openai`
- Model: `google/gemini-3.6-flash` (Gemini Developer API free tier on an
  account with no billing linked, so quota exhaustion fails closed with a
  quota error, never a charge)
- temperature: 0, seed: 42
- max_tokens: 4000 (runner default on the gemini path; 500 was insufficient
  because reasoning tokens count against the completion cap)
- reasoning_effort: "low" (runner default on the gemini path)
- response_format: json_schema with `strict: true`, the extractor.v2 schema
  unchanged (anyOf/minItems/additionalProperties accepted)
- Prompts: the runner's built-in system prompt + schema-envelope user message
  containing a synthetic Arabic story written for this test (non-private)
- Auth: `Authorization: Bearer $GEMINI_API_KEY` (key never stored)

## Observed response facts

- HTTP 200, finish_reason "stop"
- usage: prompt_tokens 278, completion_tokens 2033 (includes reasoning),
  total_tokens 2311
- The Gemini envelope carries no pricing fields and no provider cost lookup,
  so costUsd on this path is a local usage x configured-prices estimate
  (artifact field costUsdSource: "usage_estimate"), never provider-confirmed.
  With the enforced 0/0 free-tier prices the estimate is 0.
- validateExtractorOutput: valid, 0 errors; verifyExtraction: 12 spans
  verified, 0 rejected

## Semantic quality notes (human review of the output)

The output is mostly faithful but NOT error-free:

- UNSUPPORTED CLAIM: prop_1 places the lamp "in the house" while its quoted
  evidence only supports that a lamp exists. The location is not in the text.
- Misclassification: evt_5 labels Nadia's spoken line as a "movement" event.
- Omission: the opening Nile-city setting is not captured anywhere.
- Omission: story_time is null on every event; the "at dawn" anchor is lost.

Conclusion for quality claims: quote-level grounding passed 12/12, but
grounding alone does not catch unsupported additions to otherwise-quoted
facts. Treat extraction quality as promising, not proven.
