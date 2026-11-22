# Genie Model

Genie Model is an AI model by Genie, served through OpenRouter's free
models. Visitors chat with it for free on the `/model` page (EN + AR),
and any app can call the same model through the OpenRouter API.

## How the chat works

- Page: `src/app/[locale]/model/page.tsx`, UI in
  `src/components/ModelChat.tsx`.
- API route: `src/app/api/chat/route.ts` (POST). It validates the request,
  resolves a key, and calls
  `https://openrouter.ai/api/v1/chat/completions` with `fetch`.
- The server always sets its own system prompt; system messages sent by
  the client are dropped. Max 20 messages per request, max 4000
  characters per message, max 1024 completion tokens.
- No streaming in v1 — the route returns a plain JSON reply:
  `{ reply, model, remaining }`.

## Free model chain

The route tries these free (`:free`, $0) models in order, falling back
on 429/5xx:

1. `google/gemma-4-31b-it:free`
2. `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`
3. `inclusionai/ling-3.2-flash:free`

Free models are rate-limited by OpenRouter and by their upstream
providers, so a 429 can happen even with a valid key — that is why the
fallback chain exists. (Verified 2026-11-22: the Gemma free model was
temporarily rate-limited upstream while the Nemotron free model worked.)
A 401/403 means the key itself was rejected, so the route returns an
honest 401 instead of trying other models. If every model fails, the
route returns 503 saying the free models are busy.

## Limits

- **10 messages per IP per UTC day**, enforced in the API route — but
  only when the shared server key is used. A visitor using their own key
  spends their own OpenRouter quota, so they are not limited here.
- The counter is in-memory and best-effort on serverless: Vercel
  instances do not share memory, so the limit is per instance, not
  global. The shared key also has its own spend limit on OpenRouter.
- Keys and message content are never logged.

## Keys — two ways to chat

1. **Server key (keyless visitor chat).** Set `OPENROUTER_API_KEY` as an
   environment variable on Vercel: Project → Settings → Environment
   Variables → add `OPENROUTER_API_KEY` (Production), then redeploy.
   Create the key at https://openrouter.ai/keys and give it a credit
   limit on OpenRouter for spend control. Never commit a key value:
   `.env` and `.env*.local` are gitignored; `.env.example` carries only
   the variable name.
2. **Bring your own key (BYOK).** If no server key is set, the chat page
   shows a field where the visitor pastes their own free OpenRouter key.
   The key stays in that browser's local storage
   (`genie-model-key`) and is sent only to our own `/api/chat`, which
   forwards it to OpenRouter.

## How any app connects

Any app can call the same model through OpenRouter:

```
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer <your OpenRouter key>
Content-Type: application/json

{
  "model": "google/gemma-4-31b-it:free",
  "messages": [{ "role": "user", "content": "Hello, Genie!" }]
}
```

Docs: https://openrouter.ai/docs — keys: https://openrouter.ai/keys
