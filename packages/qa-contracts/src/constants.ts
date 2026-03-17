/**
 * Data directory for the QA plugin, relative to monorepo root.
 */
export const QA_DATA_DIR = '.kb/qa';

/**
 * File paths for QA plugin data storage (relative to monorepo root).
 */
export const PATHS = {
  BASELINE: '.kb/qa/baseline.json',
  HISTORY: '.kb/qa/history.json',
  CACHE: '.kb/qa/cache.json',
  LAST_RUN: '.kb/qa/last-run.json',
} as const;

/**
 * Maximum number of history entries to keep.
 */
export const HISTORY_MAX_ENTRIES = 50;

/**
 * Default number of entries for trend analysis window.
 */
export const TRENDS_WINDOW = 10;

/**
 * All check types in execution order.
 */
export const CHECK_TYPES = ['build', 'lint', 'typeCheck', 'test'] as const;

/**
 * Labels for check types (for display).
 */
export const CHECK_LABELS: Record<string, string> = {
  build: 'Build',
  lint: 'Lint',
  typeCheck: 'Type Check',
  test: 'Tests',
};

/**
 * Icons for check types (for display).
 */
export const CHECK_ICONS: Record<string, string> = {
  build: '🔨',
  lint: '🔍',
  typeCheck: '📘',
  test: '🧪',
};
