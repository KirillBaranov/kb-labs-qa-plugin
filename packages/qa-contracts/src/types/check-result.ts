import type { SubmoduleInfo } from './submodule.js';

/**
 * Types of checks the QA plugin can run.
 */
export type CheckType = 'build' | 'lint' | 'typeCheck' | 'test';

/**
 * Result of a single check type across all packages.
 */
export interface CheckResult {
  /** Packages that passed this check */
  passed: string[];
  /** Packages that failed this check */
  failed: string[];
  /** Packages that were skipped (up-to-date / excluded) */
  skipped: string[];
  /** Error messages keyed by package name */
  errors: Record<string, string>;
}

/**
 * Combined results of all QA check types.
 */
export type QAResults = Record<CheckType, CheckResult>;

/**
 * Options for running QA checks.
 */
export interface QARunOptions {
  /** Root directory of the monorepo */
  rootDir: string;
  /** Skip build check */
  skipBuild?: boolean;
  /** Skip lint check */
  skipLint?: boolean;
  /** Skip type check */
  skipTypes?: boolean;
  /** Skip test check */
  skipTests?: boolean;
  /** Disable caching (force full run) */
  noCache?: boolean;
  /** Filter by package name */
  package?: string;
  /** Filter by repo name */
  repo?: string;
  /** Filter by npm scope */
  scope?: string;
  /** Progress callback */
  onProgress?: (phase: CheckType, pkg: string, status: 'pass' | 'fail' | 'skip') => void;
}

/**
 * Package filter criteria.
 */
export interface PackageFilter {
  package?: string;
  repo?: string;
  scope?: string;
}

/**
 * Workspace package metadata.
 */
export interface WorkspacePackage {
  /** Package name from package.json */
  name: string;
  /** Absolute path to package directory */
  dir: string;
  /** Relative path from root */
  relativePath: string;
  /** The repo/monorepo this package belongs to */
  repo: string;
  /** Git submodule info for this package's repo */
  submodule?: SubmoduleInfo;
}

/**
 * Extended QA run result with package metadata preserved.
 */
export interface QARunResult {
  results: QAResults;
  packages: WorkspacePackage[];
}
