import type { HistoryEntry, TrendResult, EnrichedTrendResult, TrendChangelogEntry } from '@kb-labs/qa-contracts';
import { CHECK_TYPES, TRENDS_WINDOW } from '@kb-labs/qa-contracts';

/**
 * Analyze trends over a window of history entries.
 * Compares failure counts between first and last entry in the window.
 */
export function analyzeTrends(
  history: HistoryEntry[],
  window: number = TRENDS_WINDOW,
): TrendResult[] {
  if (history.length < 2) {return [];}

  const windowEntries = history.slice(-window);
  const first = windowEntries[0]!;
  const last = windowEntries[windowEntries.length - 1]!;

  const results: TrendResult[] = [];

  for (const ct of CHECK_TYPES) {
    const previous = first.summary[ct].failed;
    const current = last.summary[ct].failed;
    const delta = current - previous;

    let trend: TrendResult['trend'];
    if (delta > 0) {trend = 'regression';}
    else if (delta < 0) {trend = 'improvement';}
    else {trend = 'no-change';}

    results.push({ checkType: ct, previous, current, delta, trend });
  }

  return results;
}

/**
 * Enriched trend analysis — full time-series, per-entry changelog, velocity.
 *
 * For each check type, provides:
 * - timeSeries: all data points in the window (for charts)
 * - changelog: what changed between consecutive entries (new failures / fixes)
 * - velocity: average delta per entry (rate of change)
 */
export function analyzeEnrichedTrends(
  history: HistoryEntry[],
  window: number = TRENDS_WINDOW,
): EnrichedTrendResult[] {
  if (history.length < 2) {return [];}

  const windowEntries = history.slice(-window);
  const first = windowEntries[0]!;
  const last = windowEntries[windowEntries.length - 1]!;

  const results: EnrichedTrendResult[] = [];

  for (const ct of CHECK_TYPES) {
    // Build time-series: map each entry to a data point
    const timeSeries = windowEntries.map((entry) => ({
      timestamp: entry.timestamp,
      gitCommit: entry.git.commit,
      gitBranch: entry.git.branch,
      gitMessage: entry.git.message,
      passed: entry.summary[ct].passed,
      failed: entry.summary[ct].failed,
      skipped: entry.summary[ct].skipped,
    }));

    // Build changelog: diff failedPackages between consecutive entries
    const changelog: TrendChangelogEntry[] = [];
    const deltas: number[] = [];

    for (let i = 1; i < windowEntries.length; i++) {
      const prev = windowEntries[i - 1]!;
      const curr = windowEntries[i]!;

      const prevFailed = new Set(prev.failedPackages[ct]);
      const currFailed = curr.failedPackages[ct];
      const currFailedSet = new Set(currFailed);

      const newFailures = currFailed.filter((p) => !prevFailed.has(p));
      const fixed = [...prevFailed].filter((p) => !currFailedSet.has(p));
      const delta = currFailed.length - prevFailed.size;

      deltas.push(delta);

      // Only include entries that actually had changes
      if (newFailures.length > 0 || fixed.length > 0) {
        changelog.push({
          timestamp: curr.timestamp,
          gitCommit: curr.git.commit,
          gitMessage: curr.git.message,
          newFailures,
          fixed,
          delta,
        });
      }
    }

    // Summary metrics
    const previous = first.summary[ct].failed;
    const current = last.summary[ct].failed;
    const delta = current - previous;

    let trend: EnrichedTrendResult['trend'];
    if (delta > 0) {trend = 'regression';}
    else if (delta < 0) {trend = 'improvement';}
    else {trend = 'no-change';}

    // Velocity: average delta per entry transition
    const velocity = deltas.length > 0
      ? deltas.reduce((sum, d) => sum + d, 0) / deltas.length
      : 0;

    results.push({
      checkType: ct,
      timeSeries,
      changelog,
      current,
      previous,
      delta,
      trend,
      velocity: Math.round(velocity * 100) / 100,
    });
  }

  return results;
}
