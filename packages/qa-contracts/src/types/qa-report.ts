import type { CheckType } from './check-result.js';
import type { BaselineDiff } from './baseline.js';

/**
 * Summary section of a QA report.
 */
export interface ReportSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

/**
 * Full QA report — returned by json reporter.
 */
export interface QAReport {
  status: 'passed' | 'failed';
  timestamp: string;
  summary: Record<CheckType, ReportSummary>;
  failures: Record<CheckType, string[]>;
  errors: Record<CheckType, Record<string, string>>;
  baseline: BaselineDiff | null;
}
