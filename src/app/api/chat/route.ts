import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * Genie Model chat endpoint — POST /api/chat
 *
 * Calls OpenRouter's chat completions API with a fallback chain of free
 * models. Free models are rate-limited by OpenRouter and their upstream
 * providers, so a 429/5xx on one model falls through to the next.
 *
 * Key: the server key (OPENROUTER_API_KEY env var) when set, otherwise the
 * visitor's own free OpenRouter key sent as `userKey`. The key is never
 * logged, and message content is never logged.
 *
 * Limits: 10 messages per IP per UTC day — but only for the shared server
 * key. A visitor using their own key spends their own OpenRouter quota, so
 * they are not limited here. The counter is in-memory and best-effort on
 * serverless: instances do not share memory. The shared key also has its
 * own spend limit on OpenRouter.
 */
const MODELS = [
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "inclusionai/ling-3.2-flash:free",
] as const;

const SYSTEM_PROMPT =
  "You are Genie, a helpful AI assistant built by Genie, an independent digital venture studio. Answer in the user's language. Be concise and honest; if you don't know something, say so.";

const MAX_MESSAGES = 20;
const MAX_CHARS = 4000;
const DAILY_LIMIT = 10;
const MAX_TOKENS = 1024;

const usage = new Map<string, { day: string; count: number }>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "bad_request", "Request body must be valid JSON.");
  }
  if (!body || typeof body !== "object") {
    return jsonError(400, "bad_request", "Request body must be an object.");
  }

  const { messages, userKey } = body as {
    messages?: unknown;
    userKey?: unknown;
  };

  // Validate messages: array of 1..20, user/assistant roles only,
  // each 1..4000 chars. System messages from the client are dropped —
  // the server always uses its own system prompt.
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return jsonError(
      400,
      "bad_request",
      `messages must be an array of 1 to ${MAX_MESSAGES} messages.`,
    );
  }
  const cleaned: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") {
      return jsonError(400, "bad_request", "Each message must be an object.");
    }
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || content.trim().length === 0 || content.length > MAX_CHARS) {
      return jsonError(
        400,
        "bad_request",
        `Each message must be 1 to ${MAX_CHARS} characters.`,
      );
    }
    cleaned.push({ role, content });
  }
  if (cleaned.length === 0) {
    return jsonError(
      400,
      "bad_request",
      "At least one user or assistant message is required.",
    );
  }

  // Key: server key first, else the visitor's own key. Never logged.
  const serverKey = process.env.OPENROUTER_API_KEY;
  const visitorKey =
    typeof userKey === "string" && userKey.trim().length > 0
      ? userKey.trim()
      : undefined;
  const key = serverKey || visitorKey;
  if (!key) {
    return jsonError(
      503,
      "no_key",
      "No key is configured on the server. Add your own free OpenRouter key to chat.",
    );
  }

  // Daily limit applies only to the shared server key.
  let remaining: number | null = null;
  if (serverKey) {
    const ip = clientIp(req);
    const day = todayKey();
    const record = usage.get(ip);
    const count = record && record.day === day ? record.count : 0;
    if (count >= DAILY_LIMIT) {
      return jsonError(
        429,
        "rate_limited",
        `Free limit reached: ${DAILY_LIMIT} messages per day. Try again tomorrow, or add your own OpenRouter key.`,
      );
    }
    usage.set(ip, { day, count: count + 1 });
    remaining = DAILY_LIMIT - (count + 1);
  }

  const payloadMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...cleaned,
  ];

  for (const model of MODELS) {
    let res: Response;
    try {
      res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://genie-zeta-gold.vercel.app",
          "X-Title": "Genie",
        },
        body: JSON.stringify({
          model,
          messages: payloadMessages,
          max_tokens: MAX_TOKENS,
        }),
      });
    } catch {
      // Network error — try the next model.
      continue;
    }
    if (res.ok) {
      const data = (await res.json()) as {
        choices?: { message?: { content?: unknown } }[];
      };
      const reply = data?.choices?.[0]?.message?.content;
      if (typeof reply === "string" && reply.length > 0) {
        return NextResponse.json({ reply, model, remaining });
      }
      // Empty reply — treat as a failure and try the next model.
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      // The key itself is rejected — another model will not help.
      return jsonError(
        401,
        "invalid_key",
        "The OpenRouter key was rejected. Check the key and try again.",
      );
    }
    if (res.status === 400) {
      return jsonError(
        400,
        "bad_request",
        "The request was rejected by OpenRouter.",
      );
    }
    // 429 / 5xx — fall through to the next model.
  }

  return jsonError(
    503,
    "busy",
    "The free models are busy right now. Please try again shortly.",
  );
}
