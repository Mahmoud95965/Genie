/**
 * Story-World job queue + worker (M0) — spec sections 4 and 9.
 *
 * In-memory / offline only (the `jobs` table in the migration is the M1
 * persistence target). Contract:
 * - Enqueue is idempotent by key: repeating an idempotency key returns the
 *   existing job.
 * - Dequeue takes a lease; a crashed worker's job is requeued at most
 *   twice (lease expiry), then marked `failed`.
 * - The worker runs within the job's budget envelope and writes `result`
 *   or `error` exactly once.
 */
import { randomUUID } from "node:crypto";

export type JobKind = "extract" | "review" | "write" | "repair";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface JobBudgetState {
  maxCalls: number;
  maxTokens: number;
  maxSeconds: number;
}

export interface Job {
  id: string;
  kind: JobKind;
  status: JobStatus;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  result: unknown | null;
  error: string | null;
  budget: JobBudgetState;
  /** Crash-requeue attempts used (max 2, spec section 4). */
  attempts: number;
  /** Lease holder + expiry while running; null when not leased. */
  leaseOwner: string | null;
  leaseExpiresAt: number | null;
  createdAt: string;
  updatedAt: string;
}

export const MAX_CRASH_REQUEUES = 2;
export const DEFAULT_LEASE_MS = 60_000;

export class JobQueue {
  private jobs: Job[] = [];
  private byKey = new Map<string, Job>();

  /** Enqueue a job. Same idempotency key returns the existing job. */
  enqueue(kind: JobKind, idempotencyKey: string, payload: Record<string, unknown>, budget: JobBudgetState): Job {
    const existing = this.byKey.get(idempotencyKey);
    if (existing) return existing;
    const now = new Date().toISOString();
    const job: Job = {
      id: randomUUID(),
      kind,
      status: "queued",
      idempotencyKey,
      payload,
      result: null,
      error: null,
      budget,
      attempts: 0,
      leaseOwner: null,
      leaseExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.push(job);
    this.byKey.set(idempotencyKey, job);
    return job;
  }

  getById(id: string): Job | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  getByKey(idempotencyKey: string): Job | undefined {
    return this.byKey.get(idempotencyKey);
  }

  list(): Job[] {
    return [...this.jobs];
  }

  /**
   * Dequeue the oldest queued job with a lease. Jobs whose lease expired
   * are requeued (attempts + 1) up to MAX_CRASH_REQUEUES times; past that
   * they are marked `failed` and never dequeued again.
   */
  dequeue(workerId: string, leaseMs: number = DEFAULT_LEASE_MS): Job | null {
    const now = Date.now();
    for (const job of this.jobs) {
      if (job.status === "running" && job.leaseExpiresAt !== null && job.leaseExpiresAt <= now) {
        // Lease expired: worker crashed (or died). Requeue or fail.
        job.attempts += 1;
        job.leaseOwner = null;
        job.leaseExpiresAt = null;
        if (job.attempts > MAX_CRASH_REQUEUES) {
          job.status = "failed";
          job.error = "JOB_CRASHED: lease expired after max requeues.";
        } else {
          job.status = "queued";
        }
        job.updatedAt = new Date().toISOString();
      }
    }
    const next = this.jobs.find((j) => j.status === "queued");
    if (!next) return null;
    next.status = "running";
    next.leaseOwner = workerId;
    next.leaseExpiresAt = now + leaseMs;
    next.updatedAt = new Date().toISOString();
    return next;
  }

  /** Renew a running job's lease (heartbeat). Returns false if not leased. */
  heartbeat(jobId: string, workerId: string, leaseMs: number = DEFAULT_LEASE_MS): boolean {
    const job = this.getById(jobId);
    if (!job || job.status !== "running" || job.leaseOwner !== workerId) return false;
    job.leaseExpiresAt = Date.now() + leaseMs;
    return true;
  }

  /** Write the result exactly once; no-ops if the job already finished. */
  complete(jobId: string, result: unknown): Job | null {
    const job = this.getById(jobId);
    if (!job || job.status === "succeeded" || job.status === "failed") return job ?? null;
    job.status = "succeeded";
    job.result = result;
    job.error = null;
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
    job.updatedAt = new Date().toISOString();
    return job;
  }

  /** Write the error exactly once; no-ops if the job already finished. */
  fail(jobId: string, error: string): Job | null {
    const job = this.getById(jobId);
    if (!job || job.status === "succeeded" || job.status === "failed") return job ?? null;
    job.status = "failed";
    job.error = error;
    job.result = null;
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
    job.updatedAt = new Date().toISOString();
    return job;
  }
}
