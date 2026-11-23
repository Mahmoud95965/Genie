/**
 * Durable store snapshot for the live extraction runner (M1 smoke).
 *
 * The in-memory repository dies at process exit, so later chapters
 * would lose earlier committed state. After each commit, the runner
 * serializes the whole store — project, branch, ledger rows, the
 * local-id maps the commit step needs for cross-chapter references,
 * and the review decisions applied so far — to
 * `storyworld/local/store.json` (git-ignored; the repo is public).
 * `review-accept.ts` loads it at the start of the next run, so
 * chapter 2 builds on chapter 1's committed state.
 *
 * The snapshot is schema-versioned; loading refuses unknown versions
 * instead of guessing. Serialization uses the repository's public
 * `snapshot()` plus the project/branch records the runner already
 * holds. Restoration writes the parsed rows back into a fresh
 * in-memory repository through a cast — the store's fields are
 * TypeScript-private but plain runtime properties, and this module
 * (not the store) owns that coupling. The snapshot format is
 * local-only and never enters the repo, so a field rename fails
 * loudly in the round-trip test rather than silently corrupting a
 * shared store.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { Branch, Project } from "./state/types";
import type { LedgerSnapshot } from "./state/repository";
import { InMemoryStoryworldRepository } from "./state/memory-store";

export const STORE_SNAPSHOT_SCHEMA_VERSION = 1;

export class StoreSnapshotError extends Error {
  readonly code: "STORE_VERSION_UNKNOWN" | "STORE_INVALID" | "STORE_NOT_FOUND";
  constructor(
    code: StoreSnapshotError["code"],
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "StoreSnapshotError";
    this.code = code;
  }
}

export interface StoreSnapshotV1 {
  schemaVersion: 1;
  artifactKind: "store-snapshot";
  savedAt: string;
  project: Project;
  branch: Branch;
  ledger: LedgerSnapshot;
  localIdMaps: {
    propositions: Record<string, string>;
    events: Record<string, string>;
  };
  reviewBatches: Array<{
    batchId: string;
    artifactBatchId: string;
    chapterSeq: number | null;
    bodySha256: string;
    committedAt: string;
    commitId: string | null;
    items: Array<{
      id: string;
      section: string;
      localId: string | null;
      status: string;
      rejectReason: string | null;
    }>;
  }>;
}

export interface SaveStoreSnapshotInput {
  repo: InMemoryStoryworldRepository;
  projectId: string;
  branchId: string;
  localIdMaps: {
    propositions: Map<string, string>;
    events: Map<string, string>;
  };
  reviewBatches: StoreSnapshotV1["reviewBatches"];
}

/** Serialize the store to a versioned snapshot object (no IO). */
export function buildStoreSnapshot(input: SaveStoreSnapshotInput): StoreSnapshotV1 {
  const project = input.repo.getProject(input.projectId);
  if (!project) throw new StoreSnapshotError("STORE_INVALID", `unknown project ${input.projectId}`);
  const branch = input.repo.getBranch(input.branchId);
  if (!branch) throw new StoreSnapshotError("STORE_INVALID", `unknown branch ${input.branchId}`);
  return {
    schemaVersion: STORE_SNAPSHOT_SCHEMA_VERSION,
    artifactKind: "store-snapshot",
    savedAt: new Date().toISOString(),
    project,
    branch,
    ledger: input.repo.snapshot(input.branchId),
    localIdMaps: {
      propositions: Object.fromEntries(input.localIdMaps.propositions),
      events: Object.fromEntries(input.localIdMaps.events),
    },
    reviewBatches: input.reviewBatches,
  };
}

/** Build and write the snapshot file. Returns the snapshot object. */
export function saveStoreSnapshot(
  input: SaveStoreSnapshotInput,
  path: string,
): StoreSnapshotV1 {
  const snapshot = buildStoreSnapshot(input);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
  return snapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse and strictly validate a snapshot object. Unknown versions refuse. */
export function parseStoreSnapshot(value: unknown): StoreSnapshotV1 {
  if (!isRecord(value)) {
    throw new StoreSnapshotError("STORE_INVALID", "snapshot is not a JSON object");
  }
  if (value.schemaVersion !== STORE_SNAPSHOT_SCHEMA_VERSION) {
    throw new StoreSnapshotError(
      "STORE_VERSION_UNKNOWN",
      `snapshot schemaVersion is ${JSON.stringify(value.schemaVersion)}; ` +
        `this build understands only ${STORE_SNAPSHOT_SCHEMA_VERSION}`,
    );
  }
  if (value.artifactKind !== "store-snapshot") {
    throw new StoreSnapshotError("STORE_INVALID", "snapshot artifactKind is not \"store-snapshot\"");
  }
  if (!isRecord(value.project) || typeof value.project.id !== "string") {
    throw new StoreSnapshotError("STORE_INVALID", "snapshot has no project record");
  }
  if (!isRecord(value.branch) || typeof value.branch.id !== "string") {
    throw new StoreSnapshotError("STORE_INVALID", "snapshot has no branch record");
  }
  if (!isRecord(value.ledger) || !Array.isArray(value.ledger.commits)) {
    throw new StoreSnapshotError("STORE_INVALID", "snapshot has no ledger snapshot");
  }
  if (!isRecord(value.localIdMaps)) {
    throw new StoreSnapshotError("STORE_INVALID", "snapshot has no localIdMaps");
  }
  if (!Array.isArray(value.reviewBatches)) {
    throw new StoreSnapshotError("STORE_INVALID", "snapshot has no reviewBatches array");
  }
  return value as unknown as StoreSnapshotV1;
}

/** Read and validate a snapshot file. Throws STORE_NOT_FOUND when absent. */
export function loadStoreSnapshot(path: string): StoreSnapshotV1 {
  if (!existsSync(path)) {
    throw new StoreSnapshotError("STORE_NOT_FOUND", `no store snapshot at ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch (error) {
    throw new StoreSnapshotError(
      "STORE_INVALID",
      `snapshot at ${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseStoreSnapshot(parsed);
}

/** Read a snapshot file when it exists; null when absent. */
export function loadStoreSnapshotIfExists(path: string): StoreSnapshotV1 | null {
  if (!existsSync(path)) return null;
  return loadStoreSnapshot(path);
}

export interface RehydratedStore {
  repo: InMemoryStoryworldRepository;
  project: Project;
  branch: Branch;
  localIdMaps: {
    propositions: Map<string, string>;
    events: Map<string, string>;
  };
  reviewBatches: StoreSnapshotV1["reviewBatches"];
}

/**
 * Rebuild a live repository from a snapshot, preserving every row id
 * (ledger rows, characters, chapters, revisions, commits, findings).
 * The repository is restored by assigning its private fields through
 * a cast — see the module header for why this coupling lives here.
 */
export function rehydrateRepository(snapshot: StoreSnapshotV1): RehydratedStore {
  const repo = new InMemoryStoryworldRepository();
  const ledger = snapshot.ledger;
  const fields = repo as unknown as Record<string, unknown>;
  fields.projects = [snapshot.project];
  fields.branches = [snapshot.branch];
  fields.heads = new Map<string, string | null>([[snapshot.branch.id, ledger.headCommitId]]);
  fields.commits = ledger.commits;
  fields.characters = ledger.characters;
  fields.chapters = ledger.chapters;
  fields.revisions = ledger.chapterRevisions;
  fields.chapterHeads = ledger.chapterHeads;
  fields.propositions = ledger.propositions;
  fields.events = ledger.events;
  fields.participants = ledger.participants;
  fields.knowledge = ledger.knowledge;
  fields.knowledgeUses = ledger.knowledgeUses;
  fields.knowledgeDenials = ledger.knowledgeDenials;
  fields.characterFacts = ledger.characterFacts;
  fields.promises = ledger.promises;
  fields.promiseResolutions = ledger.promiseResolutions;
  fields.retractions = ledger.retractions;
  fields.findings = ledger.findings;
  return {
    repo,
    project: snapshot.project,
    branch: snapshot.branch,
    localIdMaps: {
      propositions: new Map(Object.entries(snapshot.localIdMaps.propositions)),
      events: new Map(Object.entries(snapshot.localIdMaps.events)),
    },
    reviewBatches: snapshot.reviewBatches,
  };
}
