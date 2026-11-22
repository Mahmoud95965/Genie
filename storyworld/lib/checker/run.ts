/**
 * Checker runner (M1) — spec sections 7 and 9.
 *
 * Derives the projected state for a branch, runs all rules, and stores
 * the findings against the current head commit. Re-running on the same
 * head does not duplicate an open finding with the same rule, subjects
 * and confidence.
 *
 * M1.1: `runCheckerDetailed` also returns the run's notes (e.g. the
 * own-event resurrection clearances from item 4a). Notes are not
 * findings and are not stored — they are returned to the caller so a
 * reviewer can see why a would-be finding was cleared. `runChecker`
 * keeps the M1 return shape (findings only).
 */
import { projectState } from "../state/projections";
import type { StoryworldRepository } from "../state/repository";
import type { Finding } from "../state/types";
import { runAllChecks, type CheckerNote, type CheckerOptions } from "./rules";

function sameSubjects(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

export function runCheckerDetailed(
  repo: StoryworldRepository,
  branchId: string,
  options: CheckerOptions = {},
): { findings: Finding[]; notes: CheckerNote[] } {
  const snapshot = repo.snapshot(branchId);
  const head = snapshot.headCommitId;
  if (head === null) return { findings: [], notes: [] };
  const state = projectState(snapshot);
  const { findings: checks, notes } = runAllChecks(state, options);
  const stored: Finding[] = [];
  for (const finding of checks) {
    const duplicate = repo
      .listFindings(branchId, "open")
      .find(
        (f) =>
          f.ruleCode === finding.ruleCode &&
          f.confidence === finding.confidence &&
          sameSubjects(f.subjects, finding.subjects),
      );
    if (duplicate) {
      stored.push(duplicate);
      continue;
    }
    stored.push(
      repo.addFinding({
        branchId,
        commitId: head,
        source: "rule_checker",
        ruleCode: finding.ruleCode,
        confidence: finding.confidence,
        description: finding.description,
        reason: finding.reason,
        subjects: finding.subjects,
        evidence: finding.evidence,
      }),
    );
  }
  return { findings: stored, notes };
}

export function runChecker(
  repo: StoryworldRepository,
  branchId: string,
  options: CheckerOptions = {},
): Finding[] {
  return runCheckerDetailed(repo, branchId, options).findings;
}
