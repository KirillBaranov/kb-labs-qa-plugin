import type { QAResults, BaselineDiff, HistoryEntry, TrendResult, RegressionResult, BaselineSnapshot, GroupedResults, CheckType } from '@kb-labs/qa-contracts';
import { CHECK_TYPES, CHECK_LABELS, CHECK_ICONS } from '@kb-labs/qa-contracts';

export interface ReportSection {
  header: string;
  lines: string[];
}

function icon(ct: string): string {
  return CHECK_ICONS[ct] ?? '';
}

function label(ct: string): string {
  return CHECK_LABELS[ct] ?? ct;
}

/**
 * Build text report for a QA run.
 * Returns structured sections — CLI layer adds ANSI colors.
 */
export function buildRunReport(results: QAResults, diff?: BaselineDiff | null): ReportSection[] {
  const sections: ReportSection[] = [];

  const summaryLines: string[] = [];
  for (const ct of CHECK_TYPES) {
    const r = results[ct];
    const total = r.passed.length + r.failed.length + r.skipped.length;
    const pct = total > 0 ? Math.round((r.passed.length / total) * 100) : 100;
    const status = r.failed.length === 0 ? 'PASS' : 'FAIL';

    summaryLines.push(`${status} ${icon(ct)}  ${label(ct).padEnd(12)} ${r.passed.length}/${total} passed (${pct}%)`);

    if (r.failed.length > 0) {
      const shown = r.failed.slice(0, 5);
      for (const pkg of shown) {
        summaryLines.push(`     - ${pkg}`);
      }
      if (r.failed.length > 5) {
        summaryLines.push(`     ... and ${r.failed.length - 5} more`);
      }
    }
  }
  sections.push({ header: 'QA Summary Report', lines: summaryLines });

  if (diff) {
    const diffLines: string[] = [];
    for (const ct of CHECK_TYPES) {
      const d = diff[ct];
      if (d.newFailures.length > 0) {
        diffLines.push(`${icon(ct)} ${label(ct)}: +${d.newFailures.length} new failures`);
        for (const pkg of d.newFailures) {
          diffLines.push(`     - ${pkg}`);
        }
      }
      if (d.fixed.length > 0) {
        diffLines.push(`${icon(ct)} ${label(ct)}: -${d.fixed.length} fixed`);
      }
    }
    if (diffLines.length > 0) {
      sections.push({ header: 'Baseline Comparison', lines: diffLines });
    }
  }

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  for (const ct of CHECK_TYPES) {
    totalPassed += results[ct].passed.length;
    totalFailed += results[ct].failed.length;
    totalSkipped += results[ct].skipped.length;
  }
  sections.push({
    header: 'Totals',
    lines: [`Total: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped`],
  });

  return sections;
}

/**
 * Build history table for display.
 */
export function buildHistoryTable(history: HistoryEntry[], limit: number = 20): ReportSection[] {
  const entries = history.slice(-limit);
  const lines: string[] = [];

  for (const entry of entries) {
    const date = new Date(entry.timestamp).toLocaleDateString();
    const status = entry.status === 'passed' ? 'PASS' : 'FAIL';
    const summary = CHECK_TYPES.map((ct) => {
      const s = entry.summary[ct];
      return `${icon(ct)} ${s.failed}F`;
    }).join(' ');

    lines.push(`${date} ${entry.git.commit} ${status} ${summary} ${entry.git.message.slice(0, 40)}`);
  }

  return [{ header: `QA History (last ${entries.length})`, lines }];
}

/**
 * Build trends report.
 */
export function buildTrendsReport(trends: TrendResult[], history: HistoryEntry[]): ReportSection[] {
  if (trends.length === 0) {
    return [{ header: 'QA Trends', lines: ['Not enough history (need at least 2 entries)'] }];
  }

  const lines: string[] = [];
  for (const t of trends) {
    const arrow = t.delta > 0 ? `+${t.delta} (regression)` : t.delta < 0 ? `${t.delta} (improvement)` : '→ no change';
    lines.push(`${icon(t.checkType)} ${label(t.checkType).padEnd(12)} ${t.previous} → ${t.current}  ${arrow}`);
  }

  if (history.length >= 2) {
    const first = history[Math.max(0, history.length - 10)]!;
    const last = history[history.length - 1]!;
    lines.push('');
    lines.push(`Period: ${new Date(first.timestamp).toLocaleDateString()} → ${new Date(last.timestamp).toLocaleDateString()}`);
  }

  return [{ header: 'QA Trends', lines }];
}

/**
 * Build regressions report.
 */
export function buildRegressionsReport(result: RegressionResult, history: HistoryEntry[]): ReportSection[] {
  if (history.length < 2) {
    return [{ header: 'Regression Detection', lines: ['Not enough history (need at least 2 entries)'] }];
  }

  const prev = history[history.length - 2]!;
  const curr = history[history.length - 1]!;
  const lines: string[] = [
    `Comparing: ${prev.git.commit} → ${curr.git.commit}`,
    '',
  ];

  if (!result.hasRegressions) {
    lines.push('No regressions detected.');
    return [{ header: 'Regression Detection', lines }];
  }

  for (const r of result.regressions) {
    lines.push(`${r.checkType}: +${r.newFailures.length} new failures`);
    for (const pkg of r.newFailures) {
      lines.push(`  - ${pkg}`);
    }
  }

  lines.push('');
  lines.push('REGRESSIONS DETECTED!');

  return [{ header: 'Regression Detection', lines }];
}

/**
 * Build baseline status report.
 */
export function buildBaselineReport(baseline: BaselineSnapshot | null): ReportSection[] {
  if (!baseline) {
    return [{ header: 'Baseline Status', lines: ['No baseline captured yet. Run baseline:update first.'] }];
  }

  const lines: string[] = [
    `Captured: ${new Date(baseline.timestamp).toLocaleString()}`,
    `Git: ${baseline.git.commit} (${baseline.git.branch})`,
    '',
  ];

  for (const ct of CHECK_TYPES) {
    const r = baseline.results[ct];
    lines.push(`${icon(ct)} ${label(ct).padEnd(12)} ${r.passed} passed, ${r.failed} failed`);
    if (r.failedPackages.length > 0) {
      const shown = r.failedPackages.slice(0, 3);
      for (const pkg of shown) {
        lines.push(`     - ${pkg}`);
      }
      if (r.failedPackages.length > 3) {
        lines.push(`     ... and ${r.failedPackages.length - 3} more`);
      }
    }
  }

  return [{ header: 'Baseline Status', lines }];
}

/**
 * Format a check status tag. Failed checks are UPPERCASED.
 */
function checkTag(status: 'passed' | 'failed' | 'skipped', ct: CheckType): string {
  const short = ct === 'typeCheck' ? 'types' : ct;
  if (status === 'failed') {return short.toUpperCase();}
  if (status === 'skipped') {return `-${short}-`;}
  return short;
}

/**
 * Build a detailed report grouped by category → repo → packages.
 */
export function buildDetailedRunReport(grouped: GroupedResults, diff?: BaselineDiff | null): ReportSection[] {
  const sections: ReportSection[] = [];

  const categoryKeys = Object.keys(grouped.categories);

  // Sort: named categories first (alphabetically), 'uncategorized' last
  categoryKeys.sort((a, b) => {
    if (a === 'uncategorized') {return 1;}
    if (b === 'uncategorized') {return -1;}
    return a.localeCompare(b);
  });

  for (const catKey of categoryKeys) {
    const cat = grouped.categories[catKey]!;
    const lines: string[] = [];

    lines.push(`PASS ${cat.summary.passed} | FAIL ${cat.summary.failed}`);
    lines.push('');

    const repoKeys = Object.keys(cat.repos).sort();
    for (const repoKey of repoKeys) {
      const repo = cat.repos[repoKey]!;
      lines.push(`  ${repoKey} (${repo.summary.total} packages)`);

      // Sort packages: failed first, then passed, then skipped
      const sorted = [...repo.packages].sort((a, b) => {
        const aFail = CHECK_TYPES.some((ct) => a.checks[ct] === 'failed') ? 0 : 1;
        const bFail = CHECK_TYPES.some((ct) => b.checks[ct] === 'failed') ? 0 : 1;
        if (aFail !== bFail) {return aFail - bFail;}
        return a.name.localeCompare(b.name);
      });

      for (const pkg of sorted) {
        const hasFail = CHECK_TYPES.some((ct) => pkg.checks[ct] === 'failed');
        const status = hasFail ? 'FAIL' : 'PASS';
        const tags = CHECK_TYPES.map((ct) => checkTag(pkg.checks[ct], ct)).join(' ');
        lines.push(`    ${status} ${pkg.name.padEnd(40)} ${tags}`);

        // Show error details for failed checks
        if (hasFail) {
          for (const ct of CHECK_TYPES) {
            if (pkg.checks[ct] === 'failed') {
              const raw = (pkg.errors[ct] ?? '').trim();
              // Find first meaningful error line (skip empty, skip "Command failed:" prefix)
              const errLines = raw.split('\n').filter((l) => l.trim().length > 0);
              let preview = '';
              for (const el of errLines) {
                const cleaned = el.replace(/^Command failed: .*/, '').trim();
                if (cleaned.length > 0) {
                  // Shorten absolute paths: /Users/.../kb-labs/kb-labs-core/... → kb-labs-core/...
                  preview = cleaned.replace(/\/[^\s]*\/kb-labs\//g, '').slice(0, 100);
                  break;
                }
              }
              lines.push(`         ${ct}: ${preview || 'failed'}`);
            }
          }
        }
      }
      lines.push('');
    }

    sections.push({
      header: `${cat.label} (${cat.summary.total} packages)`,
      lines,
    });
  }

  // Baseline diff section (reuse from buildRunReport)
  if (diff) {
    const diffLines: string[] = [];
    for (const ct of CHECK_TYPES) {
      const d = diff[ct];
      if (d.newFailures.length > 0) {
        diffLines.push(`${icon(ct)} ${label(ct)}: +${d.newFailures.length} new failures`);
        for (const pkg of d.newFailures) {
          diffLines.push(`     - ${pkg}`);
        }
      }
      if (d.fixed.length > 0) {
        diffLines.push(`${icon(ct)} ${label(ct)}: -${d.fixed.length} fixed`);
      }
    }
    if (diffLines.length > 0) {
      sections.push({ header: 'Baseline Comparison', lines: diffLines });
    }
  }

  // Grand totals
  let totalPassed = 0;
  let totalFailed = 0;
  for (const catKey of categoryKeys) {
    totalPassed += grouped.categories[catKey]!.summary.passed;
    totalFailed += grouped.categories[catKey]!.summary.failed;
  }
  sections.push({
    header: 'Totals',
    lines: [`Total: ${totalPassed} passed, ${totalFailed} failed (${categoryKeys.length} categories)`],
  });

  return sections;
}
