import type { QARunOptions, QAResults, QARunResult, CheckResult } from '@kb-labs/qa-contracts';
import { getWorkspacePackages } from './workspace.js';
import { runCustomChecks } from './custom-check-runner.js';
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
 * If options.checks is provided, uses custom check runners instead of built-ins.
 */
export async function runQA(options: QARunOptions): Promise<QARunResult> {
  const { rootDir, noCache } = options;

  // Normalise skip list: lowercase, support aliases
  const SKIP_ALIASES: Record<string, string> = {
    types: 'typecheck',
    'type-check': 'typecheck',
    tests: 'test',
  };
  const skipSet = new Set(
    (options.skipChecks ?? []).map(s => SKIP_ALIASES[s.toLowerCase()] ?? s.toLowerCase()),
  );

  const filter = {
    package: options.package,
    repo: options.repo,
    scope: options.scope,
  };

  const packages = getWorkspacePackages(rootDir, filter, options.packagesConfig);
  let cache = noCache ? {} : loadCache(rootDir);

  const results: QAResults = {
    build: emptyResult(),
    lint: emptyResult(),
    typeCheck: emptyResult(),
    test: emptyResult(),
  };

  if (options.checks && options.checks.length > 0) {
    // Config-driven checks mode — filter out skipped check IDs
    const activeChecks = skipSet.size > 0
      ? options.checks.filter(c => !skipSet.has(c.id.toLowerCase()))
      : options.checks;

    const checkResults = runCustomChecks(
      activeChecks,
      packages,
      rootDir,
      (checkId, pkg, status) => {
        const phase = checkId === 'typeCheck' || checkId === 'typecheck' ? 'typeCheck'
          : checkId === 'test' || checkId === 'tests' ? 'test'
          : checkId === 'lint' ? 'lint'
          : 'build';
        options.onProgress?.(phase as any, pkg, status);
      },
    );
    Object.assign(results, checkResults);
  } else {
    // Built-in runners mode — canonical IDs: build, lint, typecheck, test
    if (!skipSet.has('build')) {
      results.build = runBuildCheck({
        rootDir,
        packages,
        noCache,
        onProgress: (pkg, status) => options.onProgress?.('build', pkg, status),
      });
    }

    if (!skipSet.has('lint')) {
      results.lint = runLintCheck({
        rootDir,
        packages,
        onProgress: (pkg, status) => options.onProgress?.('lint', pkg, status),
      });
    }

    if (!skipSet.has('typecheck')) {
      results.typeCheck = runTypeCheck({
        rootDir,
        packages,
        onProgress: (pkg, status) => options.onProgress?.('typeCheck', pkg, status),
      });
    }

    if (!skipSet.has('test')) {
      results.test = runTestCheck({
        rootDir,
        packages,
        onProgress: (pkg, status) => options.onProgress?.('test', pkg, status),
      });
    }
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
