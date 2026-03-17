import type { QARunOptions, QAResults, QARunResult, CheckResult } from '@kb-labs/qa-contracts';
import { getWorkspacePackages } from './workspace.js';
import { loadCache, saveCache, updateCacheEntry } from './cache.js';
import { runBuildCheck } from './build-runner.js';
import { runLintCheck } from './lint-runner.js';
import { runTypeCheck } from './type-runner.js';
import { runTestCheck } from './test-runner.js';
import { saveLastRun } from './last-run-store.js';

function emptyResult(): CheckResult {
  return { passed: [], failed: [], skipped: [], errors: {} };
}

/**
 * Run all QA checks in order: build → lint → typeCheck → test.
 * Respects skip flags and package filters.
 */
export async function runQA(options: QARunOptions): Promise<QARunResult> {
  const { rootDir, skipBuild, skipLint, skipTypes, skipTests, noCache } = options;

  const filter = {
    package: options.package,
    repo: options.repo,
    scope: options.scope,
  };

  const packages = getWorkspacePackages(rootDir, filter);
  let cache = noCache ? {} : loadCache(rootDir);

  const results: QAResults = {
    build: emptyResult(),
    lint: emptyResult(),
    typeCheck: emptyResult(),
    test: emptyResult(),
  };

  // Build
  if (!skipBuild) {
    results.build = runBuildCheck({
      rootDir,
      packages,
      noCache,
      onProgress: (pkg, status) => options.onProgress?.('build', pkg, status),
    });
  }

  // Lint
  if (!skipLint) {
    results.lint = runLintCheck({
      rootDir,
      packages,
      onProgress: (pkg, status) => options.onProgress?.('lint', pkg, status),
    });
  }

  // Type Check
  if (!skipTypes) {
    results.typeCheck = runTypeCheck({
      rootDir,
      packages,
      onProgress: (pkg, status) => options.onProgress?.('typeCheck', pkg, status),
    });
  }

  // Tests
  if (!skipTests) {
    results.test = runTestCheck({
      rootDir,
      packages,
      onProgress: (pkg, status) => options.onProgress?.('test', pkg, status),
    });
  }

  // Update cache with current hashes
  if (!noCache) {
    for (const pkg of packages) {
      cache = updateCacheEntry(pkg.dir, pkg.name, cache);
    }
    saveCache(rootDir, cache);
  }

  // Persist full results for the details endpoint
  const submodules: Record<string, import('@kb-labs/qa-contracts').SubmoduleInfo> = {};
  for (const pkg of packages) {
    if (pkg.submodule && !submodules[pkg.repo]) {
      submodules[pkg.repo] = pkg.submodule;
    }
  }
  saveLastRun(rootDir, results, packages, Object.keys(submodules).length > 0 ? submodules : undefined);

  return { results, packages };
}
