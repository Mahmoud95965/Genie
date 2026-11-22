"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  KeyRound,
  Languages,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { localizedPath, type Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";

type ModelMessages = Messages["model"];

export type ChatMode = "general" | "company";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

interface ModelChatProps {
  t: ModelMessages;
  /** "general" — the standalone /model chat. "company" — contact-page chat, Genie only. */
  mode?: ChatMode;
  /** Compact card (contact page) instead of the full-screen chat. */
  compact?: boolean;
  /** Empty-state greeting text. */
  greeting: string;
  /** Suggestion chips shown in the empty state. */
  suggestions: string[];
  /** Locale, used for the "Back to site" link in full-screen mode. */
  locale: Locale;
  /** Language switcher for the full-screen top bar (no global navbar there). */
  switchTo?: { locale: Locale; label: string; href: string; ariaLabel: string };
}

const KEY_STORAGE = "genie-model-key";
const CHAT_STORAGE: Record<ChatMode, string> = {
  general: "genie-model-chat",
  company: "genie-company-chat",
};

function isChatMsg(v: unknown): v is ChatMsg {
  if (!v || typeof v !== "object") return false;
  const { role, content } = v as { role?: unknown; content?: unknown };
  return (
    (role === "user" || role === "assistant") &&
    typeof content === "string" &&
    content.length > 0 &&
    content.length <= 4000
  );
}

/**
 * Genie Model chat — talks to our own /api/chat, which forwards to
 * OpenRouter. A visitor's own key, when saved, lives only in this
 * browser's local storage and is sent only to /api/chat.
 *
 * Full-screen mode is its own ChatGPT-like screen (100dvh, pinned
 * composer). Compact mode is a card for the contact page. The
 * conversation is persisted in localStorage and restored on load.
 */
export default function ModelChat({
  t,
  mode = "general",
  compact = false,
  greeting,
  suggestions,
  locale,
  switchTo,
}: ModelChatProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [userKey, setUserKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatStorage = CHAT_STORAGE[mode];
  const homeHref = localizedPath(locale, "/");

  // Restore the saved conversation (and key) after mount, so the
  // server-rendered HTML and the first client render match.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY_STORAGE);
      if (saved) {
        setUserKey(saved);
        setKeySaved(true);
      }
      const raw = localStorage.getItem(chatStorage);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setMessages(parsed.filter(isChatMsg).slice(-20));
        }
      }
    } catch {
      // Storage unavailable — the chat still works in-memory.
    }
    setLoaded(true);
  }, [chatStorage]);

  // Persist the conversation.
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(chatStorage, JSON.stringify(messages.slice(-20)));
    } catch {
      // Storage unavailable — ignore.
    }
  }, [messages, loaded, chatStorage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  function newChat() {
    setMessages([]);
    setError(null);
    setInput("");
  }

  function saveKey() {
    const k = keyDraft.trim();
    if (!k) return;
    try {
      localStorage.setItem(KEY_STORAGE, k);
    } catch {
      // Storage unavailable — keep it in memory only.
    }
    setUserKey(k);
    setKeySaved(true);
    setKeyDraft("");
    setShowKey(false);
    setError(null);
  }

  function clearKey() {
    try {
      localStorage.removeItem(KEY_STORAGE);
    } catch {
      // Ignore.
    }
    setUserKey("");
    setKeySaved(false);
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    setError(null);
    const next: ChatMsg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          mode,
          ...(userKey ? { userKey } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        reply?: string;
        remaining?: unknown;
      };
      if (!res.ok) {
        if (res.status === 503 && data.error === "no_key") {
          setError(t.errors.noKey);
          setShowKey(true);
        } else if (res.status === 401) {
          setError(t.errors.invalidKey);
        } else if (res.status === 429) {
          setError(t.errors.rateLimited);
        } else if (res.status === 503) {
          setError(t.errors.busy);
        } else {
          setError(t.errors.generic);
        }
        return;
      }
      if (typeof data.reply === "string") {
        setMessages([...next, { role: "assistant", content: data.reply }]);
      }
      if (typeof data.remaining === "number") {
        setRemaining(data.remaining);
      } else {
        setRemaining(null);
      }
    } catch {
      setError(t.errors.generic);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    void send(input);
  }

  function onKeyDown(ev: KeyboardEvent<HTMLTextAreaElement>) {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      void send(input);
    }
  }

  const remainingBadge =
    remaining !== null ? (
      <span className="shrink-0 rounded-full border border-sky/30 bg-sky/5 px-3 py-1 text-xs text-sky">
        {t.remaining.replace("{n}", String(remaining))}
      </span>
    ) : null;

  const keyButton = (
    <button
      type="button"
      onClick={() => setShowKey((v) => !v)}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border hairline px-3.5 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-sky/60 hover:text-white"
    >
      <KeyRound className="h-3.5 w-3.5 text-sky" aria-hidden="true" />
      <span className="hidden sm:inline">{t.keyTitle}</span>
    </button>
  );

  const keyPanel = showKey ? (
    <div className="shrink-0 border-b hairline bg-white/[0.02] px-5 py-5 md:px-6">
      <p className="text-sm font-medium text-white">{t.keyTitle}</p>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        {t.keyNote}{" "}
        <a
          href="https://openrouter.ai/keys"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-sky underline decoration-sky/50 underline-offset-2 hover:text-white"
        >
          openrouter.ai/keys
        </a>
      </p>
      {keySaved ? (
        <p className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-sky" aria-hidden="true" />
            {t.keyHas}
          </span>
          <button
            type="button"
            onClick={clearKey}
            className="inline-flex items-center gap-1.5 rounded-full border hairline px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-red-400/60 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t.keyClear}
          </button>
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label htmlFor="genie-model-key" className="sr-only">
            {t.keyLabel}
          </label>
          <input
            id="genie-model-key"
            type="password"
            autoComplete="off"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder={t.keyPlaceholder}
            dir="ltr"
            className="w-full flex-1 rounded-xl border hairline bg-[#050507] px-4 py-3 text-sm text-white placeholder:text-zinc-600 transition-colors focus:border-sky/70 focus:outline-none"
          />
          <button
            type="button"
            onClick={saveKey}
            disabled={!keyDraft.trim()}
            className="shrink-0 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-sky disabled:opacity-40"
          >
            {t.keySave}
          </button>
        </div>
      )}
    </div>
  ) : null;

  const messageList = (
    <>
      {messages.map((m, i) => (
        <div
          key={i}
          className={`flex max-w-[85%] gap-3 ${
            m.role === "user" ? "self-end ms-auto" : "self-start me-auto"
          }`}
        >
          {m.role === "assistant" && (
            <Image
              src="/logo/genie-logo.jpg"
              alt=""
              width={28}
              height={28}
              className="mt-1 h-7 w-7 shrink-0 rounded-md object-cover"
            />
          )}
          <div
            className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
              m.role === "user"
                ? "bg-white text-black"
                : "border hairline bg-white/[0.04] text-zinc-100"
            }`}
          >
            {m.content}
          </div>
        </div>
      ))}
      {loading && (
        <div className="flex max-w-[85%] gap-3 self-start me-auto">
          <Image
            src="/logo/genie-logo.jpg"
            alt=""
            width={28}
            height={28}
            className="mt-1 h-7 w-7 shrink-0 rounded-md object-cover"
          />
          <div className="flex items-center gap-1.5 rounded-2xl border hairline bg-white/[0.04] px-4 py-3.5">
            <span className="sr-only">{t.typing}</span>
            {[0, 1, 2].map((d) => (
              <span
                key={d}
                className="h-2 w-2 animate-bounce rounded-full bg-sky"
                style={{ animationDelay: `${d * 0.15}s` }}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </>
  );

  const errorBanner = error ? (
    <p
      role="alert"
      className="mx-5 mb-4 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-400/5 px-4 py-3 text-sm leading-relaxed text-red-200 md:mx-6"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {error}
    </p>
  ) : null;

  const composer = (
    <form onSubmit={onSubmit} className={compact ? "border-t hairline p-4 md:p-5" : "shrink-0 px-4 pb-5 pt-3 md:px-6 md:pb-6"}>
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-end gap-3">
          <label htmlFor="genie-model-input" className="sr-only">
            {t.placeholder}
          </label>
          <textarea
            id="genie-model-input"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t.placeholder}
            disabled={loading}
            className="max-h-40 min-h-[48px] w-full flex-1 resize-none rounded-xl border hairline bg-[#050507] px-4 py-3 text-[15px] text-white placeholder:text-zinc-600 transition-colors focus:border-sky/70 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label={t.send}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-sky disabled:opacity-40"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-5 w-5 rtl:-scale-x-100" aria-hidden="true" />
            )}
          </button>
        </div>
        <p className="mt-3 text-center text-xs leading-relaxed text-zinc-600">
          {t.limitNote}
        </p>
      </div>
    </form>
  );

  const suggestionChips = (
    <div className="mt-5 flex flex-wrap gap-2">
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => void send(s)}
          className="rounded-full border hairline px-4 py-2 text-sm text-zinc-200 transition-colors hover:border-sky/60 hover:text-white"
        >
          {s}
        </button>
      ))}
    </div>
  );

  /* ——— Compact card (contact page) ——— */
  if (compact) {
    return (
      <div className="overflow-hidden rounded-2xl border hairline bg-[#0A0A0F]">
        <div className="flex flex-wrap items-center gap-3 border-b hairline px-5 py-4 md:px-6">
          <Image
            src="/logo/genie-logo.jpg"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold text-white">Genie Model</p>
            <p className="text-xs text-zinc-500">{t.limitNote}</p>
          </div>
          {remainingBadge}
          {keyButton}
          <button
            type="button"
            onClick={newChat}
            aria-label={t.newChat}
            title={t.newChat}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border hairline text-zinc-200 transition-colors hover:border-sky/60 hover:text-white"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {keyPanel}

        <div
          className="flex max-h-[520px] min-h-[320px] flex-col space-y-4 overflow-y-auto px-5 py-6 md:px-6"
          aria-live="polite"
        >
          {messages.length === 0 && !loading && (
            <div>
              <p className="max-w-md leading-relaxed text-zinc-400">{greeting}</p>
              {suggestionChips}
            </div>
          )}
          {messageList}
        </div>

        {errorBanner}
        {composer}
      </div>
    );
  }

  /* ——— Full-screen chat (standalone /model page) ——— */
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#050507]">
      {/* Own top bar — no global Navbar/Footer on this page */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b hairline px-4 md:h-16 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Image
            src="/logo/genie-logo.jpg"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-lg object-cover"
          />
          <p className="truncate font-display text-base font-bold text-white md:text-lg">
            Genie Model
          </p>
          {remainingBadge}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {switchTo && (
            <Link
              href={switchTo.href}
              lang={switchTo.locale}
              aria-label={switchTo.ariaLabel}
              className="inline-flex items-center gap-1.5 rounded-full border hairline px-3.5 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-sky/60 hover:text-white"
            >
              <Languages className="h-3.5 w-3.5 text-sky" aria-hidden="true" />
              {switchTo.label}
            </Link>
          )}
          {keyButton}
          <button
            type="button"
            onClick={newChat}
            className="inline-flex items-center gap-1.5 rounded-full border hairline px-3.5 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-sky/60 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5 text-sky" aria-hidden="true" />
            <span className="hidden sm:inline">{t.newChat}</span>
          </button>
          <Link
            href={homeHref}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-medium text-black transition-colors hover:bg-sky"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
            <span className="hidden sm:inline">{t.backToSite}</span>
          </Link>
        </div>
      </header>

      {keyPanel}

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-6 md:px-6 md:py-10">
          {messages.length === 0 && !loading ? (
            <div className="my-auto flex flex-col items-center py-6 text-center">
              <Image
                src="/logo/genie-logo.jpg"
                alt=""
                width={56}
                height={56}
                className="h-14 w-14 rounded-2xl object-cover"
              />
              <h1 className="display mt-6 font-display text-3xl font-bold text-white md:text-4xl">
                {greeting}
              </h1>
              <p className="mt-4 inline-flex rounded-full border border-sky/30 bg-sky/5 px-4 py-1.5 text-sm text-sky">
                {t.limitNote}
              </p>
              {mode === "general" && (
                <>
                  <div className="mt-8 grid w-full gap-3 text-start sm:grid-cols-2">
                    <div className="rounded-2xl border hairline bg-white/[0.02] p-5">
                      <p className="text-sm font-medium text-white">{t.powerHeading}</p>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t.powerText}</p>
                    </div>
                    <div className="rounded-2xl border hairline bg-white/[0.02] p-5">
                      <p className="text-sm font-medium text-white">{t.audienceHeading}</p>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t.audienceText}</p>
                    </div>
                  </div>
                  <p className="mt-5 text-xs leading-relaxed text-zinc-600">{t.cannot}</p>
                </>
              )}
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-full border hairline px-4 py-2 text-sm text-zinc-200 transition-colors hover:border-sky/60 hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col space-y-4">{messageList}</div>
          )}
        </div>
      </div>

      {errorBanner}
      {composer}
    </div>
  );
}
