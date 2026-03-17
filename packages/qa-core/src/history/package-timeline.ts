import type { HistoryEntry, CheckType } from '@kb-labs/qa-contracts';
import type { PackageTimelineEntry, PackageTimelineResponse } from '@kb-labs/qa-contracts';
import { CHECK_TYPES } from '@kb-labs/qa-contracts';

/**
 * Build a timeline for a specific package across QA history.
 * Computes flaky score, current streak, and first failure timestamp.
 */
export function getPackageTimeline(
  history: HistoryEntry[],
  packageName: string,
): PackageTimelineResponse {
  let repo = 'unknown';

  // Build entries (newest first — history is stored oldest-first, so reverse)
  const entries: PackageTimelineEntry[] = [];

  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i]!; // safe: loop bounds guarantee valid index
    const checks: Record<string, 'passed' | 'failed' | 'skipped'> = {};
    let found = false;

    for (const ct of CHECK_TYPES) {
      const failedList = h.failedPackages[ct];
      const summaryEntry = h.summary[ct];

      if (failedList?.includes(packageName)) {
        checks[ct] = 'failed';
        found = true;
      } else if (summaryEntry && (summaryEntry.passed > 0 || summaryEntry.failed > 0)) {
        checks[ct] = 'passed';
        found = true;
      } else {
        checks[ct] = 'skipped';
      }
    }

    if (!found) {continue;}

    // Try to get submodule commit for the package's repo
    let submoduleCommit: string | undefined;
    if (h.submodules) {
      for (const [repoName, info] of Object.entries(h.submodules)) {
        if (repoName === repo || repo === 'unknown') {
          submoduleCommit = info.commit;
          if (repo === 'unknown') {repo = repoName;}
        }
      }
    }

    entries.push({
      timestamp: h.timestamp,
      git: h.git,
      submoduleCommit,
      checks: checks as Record<CheckType, 'passed' | 'failed' | 'skipped'>,
    });
  }

  // Compute flaky score per check type
  const flakyChecks: CheckType[] = [];
  let totalFlips = 0;
  let totalTransitions = 0;

  for (const ct of CHECK_TYPES) {
    let flips = 0;
    let transitions = 0;
    for (let i = 1; i < entries.length; i++) {
      const prevEntry = entries[i - 1]!; // safe: i >= 1
      const currEntry = entries[i]!; // safe: loop bounds
      const prev = prevEntry.checks[ct];
      const curr = currEntry.checks[ct];
      if (prev === 'skipped' || curr === 'skipped') {continue;}
      transitions++;
      if (prev !== curr) {flips++;}
    }
    if (transitions > 0 && flips / transitions > 0.3) {
      flakyChecks.push(ct);
    }
    totalFlips += flips;
    totalTransitions += transitions;
  }

  const flakyScore = totalTransitions > 0 ? Math.min(1, totalFlips / totalTransitions) : 0;

  // Find first failure (scan from oldest)
  let firstFailure: string | undefined;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!; // safe: loop bounds
    const hasFail = CHECK_TYPES.some((ct) => entry.checks[ct] === 'failed');
    if (hasFail) {
      firstFailure = entry.timestamp;
    }
  }

  // Current streak
  let streakStatus: 'passing' | 'failing' = 'passing';
  let streakCount = 0;
  const latest = entries[0];
  if (latest) {
    const hasFail = CHECK_TYPES.some((ct) => latest.checks[ct] === 'failed');
    streakStatus = hasFail ? 'failing' : 'passing';
    streakCount = 1;
    for (let i = 1; i < entries.length; i++) {
      const entry = entries[i]!; // safe: loop bounds
      const eFail = CHECK_TYPES.some((ct) => entry.checks[ct] === 'failed');
      const eStatus = eFail ? 'failing' : 'passing';
      if (eStatus === streakStatus) {
        streakCount++;
      } else {
        break;
      }
    }
  }

  return {
    packageName,
    repo,
    entries,
    flakyScore: Math.round(flakyScore * 100) / 100,
    flakyChecks,
    firstFailure,
    currentStreak: { status: streakStatus, count: streakCount },
  };
}
