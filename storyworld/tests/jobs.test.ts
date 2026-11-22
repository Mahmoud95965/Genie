/**
 * M0 job queue tests (spec sections 4 and 9).
 * Idempotency by key, lease dequeue, crash requeue (max twice), and
 * exactly-once result/error writes. Fully offline, in-memory.
 */
import { describe, expect, it } from "vitest";

import { JobQueue } from "../lib/jobs/queue";

const BUDGET = { maxCalls: 20, maxTokens: 100000, maxSeconds: 600 };

describe("JobQueue", () => {
  it("enqueue is idempotent by key: same key returns the existing job", () => {
    const queue = new JobQueue();
    const first = queue.enqueue("extract", "key-1", { fixtureId: "dev-short-story-v1" }, BUDGET);
    const second = queue.enqueue("extract", "key-1", { fixtureId: "dev-short-story-v1" }, BUDGET);
    expect(second.id).toBe(first.id);
    expect(queue.list()).toHaveLength(1);
  });

  it("dequeue leases the job and complete() writes the result exactly once", () => {
    const queue = new JobQueue();
    queue.enqueue("extract", "key-1", {}, BUDGET);
    const job = queue.dequeue("worker-a");
    expect(job).not.toBeNull();
    expect(job?.status).toBe("running");
    expect(job?.leaseOwner).toBe("worker-a");
    queue.complete(job!.id, { ok: true });
    expect(queue.getById(job!.id)?.status).toBe("succeeded");
    // Second write is a no-op: the first result stands.
    queue.fail(job!.id, "late error");
    const finished = queue.getById(job!.id)!;
    expect(finished.status).toBe("succeeded");
    expect(finished.result).toEqual({ ok: true });
    expect(finished.error).toBeNull();
  });

  it("fail() writes the error exactly once", () => {
    const queue = new JobQueue();
    queue.enqueue("extract", "key-1", {}, BUDGET);
    const job = queue.dequeue("worker-a")!;
    queue.fail(job.id, "boom");
    expect(queue.getById(job.id)?.status).toBe("failed");
    queue.complete(job.id, { ok: true });
    expect(queue.getById(job.id)?.status).toBe("failed");
    expect(queue.getById(job.id)?.error).toBe("boom");
  });

  it("an expired lease requeues the job at most twice, then fails it", () => {
    const queue = new JobQueue();
    queue.enqueue("extract", "key-1", {}, BUDGET);
    // Crash 1: lease expires immediately (leaseMs 0 -> expiry in the past
    // on the next dequeue pass).
    const first = queue.dequeue("worker-a", 0)!;
    expect(first.status).toBe("running");
    const second = queue.dequeue("worker-b", 0);
    expect(second?.id).toBe(first.id);
    expect(second?.attempts).toBe(1);
    // Crash 2.
    const third = queue.dequeue("worker-c", 0);
    expect(third?.id).toBe(first.id);
    expect(third?.attempts).toBe(2);
    // Crash 3: past the max requeues -> failed, never dequeued again.
    const fourth = queue.dequeue("worker-d", 0);
    expect(fourth).toBeNull();
    const job = queue.getById(first.id)!;
    expect(job.status).toBe("failed");
    expect(job.error).toContain("JOB_CRASHED");
  });

  it("heartbeat renews a lease held by the same worker only", () => {
    const queue = new JobQueue();
    queue.enqueue("extract", "key-1", {}, BUDGET);
    const job = queue.dequeue("worker-a", 60_000)!;
    expect(queue.heartbeat(job.id, "worker-b")).toBe(false);
    expect(queue.heartbeat(job.id, "worker-a")).toBe(true);
  });
});
