/**
 * QA Plugin CLI flag definitions.
 * DRY: Define once, use in manifest and command handlers.
 */

export const qaRunFlags = {
  json: {
    type: 'boolean',
    description: 'Output JSON format',
    default: false,
  },
  'skip-build': {
    type: 'boolean',
    description: 'Skip build checks',
    default: false,
  },
  'skip-lint': {
    type: 'boolean',
    description: 'Skip lint checks',
    default: false,
  },
  'skip-types': {
    type: 'boolean',
    description: 'Skip type checks',
    default: false,
  },
  'skip-tests': {
    type: 'boolean',
    description: 'Skip test checks',
    default: false,
  },
  'no-cache': {
    type: 'boolean',
    description: 'Disable caching (force full run)',
    default: false,
  },
  package: {
    type: 'string',
    description: 'Filter by package name',
    alias: 'p',
  },
  repo: {
    type: 'string',
    description: 'Filter by repo name',
    alias: 'r',
  },
  scope: {
    type: 'string',
    description: 'Filter by npm scope',
    alias: 's',
  },
  summary: {
    type: 'boolean',
    description: 'Show summary-only report (legacy flat format)',
    default: false,
  },
} as const;

export type QARunFlags = typeof qaRunFlags;

export const qaSaveFlags = {
  json: {
    type: 'boolean',
    description: 'Output JSON format',
    default: false,
  },
} as const;

export type QASaveFlags = typeof qaSaveFlags;

export const qaHistoryFlags = {
  json: {
    type: 'boolean',
    description: 'Output JSON format',
    default: false,
  },
  limit: {
    type: 'number',
    description: 'Number of entries to show',
    default: 20,
  },
} as const;

export type QAHistoryFlags = typeof qaHistoryFlags;

export const qaTrendsFlags = {
  json: {
    type: 'boolean',
    description: 'Output JSON format',
    default: false,
  },
  window: {
    type: 'number',
    description: 'Number of entries for trend window',
    default: 10,
  },
} as const;

export type QATrendsFlags = typeof qaTrendsFlags;

export const qaRegressionsFlags = {
  json: {
    type: 'boolean',
    description: 'Output JSON format',
    default: false,
  },
} as const;

export type QARegressionsFlags = typeof qaRegressionsFlags;

export const baselineUpdateFlags = {
  json: {
    type: 'boolean',
    description: 'Output JSON format',
    default: false,
  },
} as const;

export type BaselineUpdateFlags = typeof baselineUpdateFlags;

export const baselineStatusFlags = {
  json: {
    type: 'boolean',
    description: 'Output JSON format',
    default: false,
  },
} as const;

export type BaselineStatusFlags = typeof baselineStatusFlags;
