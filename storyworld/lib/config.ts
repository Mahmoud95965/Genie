/**
 * Story-World config loader (M0).
 *
 * Loads `storyworld.config.json` from the repo root and applies the typed
 * defaults from spec section 5. Server-only: uses `fs`, never bundled
 * for the client. A `null` model means that role runs in recorded-fixture
 * mode; `live_calls.enabled` starts `false` and live calls stay denied
 * until the owner explicitly enables them with a cap and priced models.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface StoryworldConfig {
  deploy_mode: "local" | "hosted";
  models: { extractor: string | null; writer: string | null; reviewer: string | null };
  require_explicit_model: boolean;
  live_calls: {
    enabled: boolean;
    hard_cap_usd_per_month: number | null;
    approved_models: unknown[];
  };
  branching: { enabled: boolean };
  openrouter: { baseUrl: string; timeoutMs: number; maxRetriesPerCall: number };
  job_budget: { maxCallsPerJob: number; maxTotalTokensPerJob: number; maxSecondsPerJob: number };
  privacy: { store_raw_outputs: boolean; raw_retention_days: number };
  checker: { closed_world_propositions: boolean };
}

/** Typed defaults, exactly per spec section 5. */
export const DEFAULT_CONFIG: StoryworldConfig = {
  deploy_mode: "local",
  models: { extractor: null, writer: null, reviewer: null },
  require_explicit_model: true,
  live_calls: { enabled: false, hard_cap_usd_per_month: null, approved_models: [] },
  branching: { enabled: false },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    timeoutMs: 120000,
    maxRetriesPerCall: 2,
  },
  job_budget: { maxCallsPerJob: 20, maxTotalTokensPerJob: 100000, maxSecondsPerJob: 600 },
  privacy: { store_raw_outputs: false, raw_retention_days: 7 },
  checker: { closed_world_propositions: false },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge a partial config object over the defaults. Unknown keys are
 * ignored; wrongly typed values fall back to the default for that key.
 */
export function mergeConfig(partial: unknown): StoryworldConfig {
  const cfg: StoryworldConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as StoryworldConfig;
  if (!isRecord(partial)) return cfg;
  if (partial.deploy_mode === "local" || partial.deploy_mode === "hosted") {
    cfg.deploy_mode = partial.deploy_mode;
  }
  if (isRecord(partial.models)) {
    for (const role of ["extractor", "writer", "reviewer"] as const) {
      const v = partial.models[role];
      if (typeof v === "string" || v === null) cfg.models[role] = v;
    }
  }
  if (typeof partial.require_explicit_model === "boolean") {
    cfg.require_explicit_model = partial.require_explicit_model;
  }
  if (isRecord(partial.live_calls)) {
    const lc = partial.live_calls;
    if (typeof lc.enabled === "boolean") cfg.live_calls.enabled = lc.enabled;
    if (typeof lc.hard_cap_usd_per_month === "number" || lc.hard_cap_usd_per_month === null) {
      cfg.live_calls.hard_cap_usd_per_month = lc.hard_cap_usd_per_month;
    }
    if (Array.isArray(lc.approved_models)) cfg.live_calls.approved_models = lc.approved_models;
  }
  if (isRecord(partial.branching) && typeof partial.branching.enabled === "boolean") {
    cfg.branching.enabled = partial.branching.enabled;
  }
  if (isRecord(partial.openrouter)) {
    const o = partial.openrouter;
    if (typeof o.baseUrl === "string") cfg.openrouter.baseUrl = o.baseUrl;
    if (typeof o.timeoutMs === "number") cfg.openrouter.timeoutMs = o.timeoutMs;
    if (typeof o.maxRetriesPerCall === "number") cfg.openrouter.maxRetriesPerCall = o.maxRetriesPerCall;
  }
  if (isRecord(partial.job_budget)) {
    const b = partial.job_budget;
    if (typeof b.maxCallsPerJob === "number") cfg.job_budget.maxCallsPerJob = b.maxCallsPerJob;
    if (typeof b.maxTotalTokensPerJob === "number") {
      cfg.job_budget.maxTotalTokensPerJob = b.maxTotalTokensPerJob;
    }
    if (typeof b.maxSecondsPerJob === "number") cfg.job_budget.maxSecondsPerJob = b.maxSecondsPerJob;
  }
  if (isRecord(partial.privacy)) {
    const p = partial.privacy;
    if (typeof p.store_raw_outputs === "boolean") cfg.privacy.store_raw_outputs = p.store_raw_outputs;
    if (typeof p.raw_retention_days === "number") cfg.privacy.raw_retention_days = p.raw_retention_days;
  }
  if (isRecord(partial.checker) && typeof partial.checker.closed_world_propositions === "boolean") {
    cfg.checker.closed_world_propositions = partial.checker.closed_world_propositions;
  }
  return cfg;
}

function repoRootDir(): string {
  // Prefer the module's own location; fall back to the working directory
  // (vitest / bundlers may not provide __dirname).
  try {
    const dir = typeof __dirname === "string" ? __dirname : "";
    if (dir) return join(dir, "..", "..");
  } catch {
    // fall through to cwd
  }
  return process.cwd();
}

function defaultConfigPath(): string {
  // storyworld/lib/config.ts -> repo root is two levels up.
  return join(repoRootDir(), "storyworld.config.json");
}

/** Load the config from disk (repo root by default), merged over defaults. */
export function loadConfig(configPath: string = defaultConfigPath()): StoryworldConfig {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    return mergeConfig({});
  }
  try {
    return mergeConfig(JSON.parse(raw) as unknown);
  } catch {
    return mergeConfig({});
  }
}

/** Repo-root path helper, used by the client and the worker to find fixtures. */
export function repoRoot(): string {
  return repoRootDir();
}
