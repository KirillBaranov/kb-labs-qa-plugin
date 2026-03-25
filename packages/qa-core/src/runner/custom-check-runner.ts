import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { QACheckConfig, QAResults, WorkspacePackage } from '@kb-labs/qa-contracts';

function emptyResult() {
  return { passed: [] as string[], failed: [] as string[], skipped: [] as string[], errors: {} as Record<string, string> };
}

/**
 * Run a command in a directory, return { ok, output }.
 */
function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): { ok: boolean; stdout: string; stderr: string; exitCode: number } {
  try {
    const result = spawnSync(command, args, {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf-8',
      shell: false,
    });
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    const exitCode = result.status ?? 1;
    return { ok: exitCode === 0, stdout, stderr, exitCode };
  } catch (e: any) {
    return { ok: false, stdout: '', stderr: e.message ?? String(e), exitCode: 1 };
  }
}

/**
 * Evaluate check result based on parser type.
 */
function evaluate(
  check: QACheckConfig,
  stdout: string,
  stderr: string,
  exitCode: number,
): boolean {
  const parser = check.parser ?? 'exitcode';
  if (parser === 'json') {
    try {
      const parsed = JSON.parse(stdout);
      return parsed.ok === true || parsed.success === true || parsed.status === 'ok';
    } catch {
      return false;
    }
  }
  return exitCode === 0;
}

/**
 * Run custom checks (from kb.config.json) across discovered packages.
 * Returns QAResults with one entry per check id.
 * Check ids map to: build, lint, typeCheck, test if they match, otherwise use id as-is.
 */
export function runCustomChecks(
  checks: QACheckConfig[],
  packages: WorkspacePackage[],
  rootDir: string,
  onProgress?: (checkId: string, pkg: string, status: 'pass' | 'fail' | 'skip') => void,
): QAResults {
  // Map check ids to canonical QA check types (for compatibility with reporting)
  const ID_MAP: Record<string, string> = {
    build: 'build',
    lint: 'lint',
    typecheck: 'typeCheck',
    'type-check': 'typeCheck',
    test: 'test',
    tests: 'test',
  };

  const results: QAResults = {};

  // Collect unique scope paths (repo root dirs) for scopePath mode
  const scopePaths = new Map<string, string>(); // repo → absolute path
  for (const pkg of packages) {
    if (!scopePaths.has(pkg.repo)) {
      // pkg.dir is like rootDir/platform/kb-labs-cli/packages/cli-core
      // repo is like platform/kb-labs-cli
      scopePaths.set(pkg.repo, resolve(rootDir, pkg.repo));
    }
  }

  for (const check of checks) {
    const canonicalId = ID_MAP[check.id.toLowerCase()] ?? check.id;
    // Ensure result bucket exists
    if (!results[canonicalId]) {
      results[canonicalId] = emptyResult();
    }
    const bucket = results[canonicalId]!;

    const timeoutMs = check.timeoutMs ?? 120_000;
    const args = check.args ?? [];

    // Resolve script paths relative to rootDir (e.g. "scripts/check.sh")
    const resolvedArgs = args.map(arg =>
      (arg.match(/\.(sh|js|ts|mjs|cjs)$/) && !arg.startsWith('/'))
        ? join(rootDir, arg)
        : arg
    );

    const runIn = check.runIn ?? 'perPackage';

    if (runIn === 'repoRoot') {
      // Run once in workspace root
      const { ok, stderr, exitCode, stdout } = runCommand(check.command, resolvedArgs, rootDir, timeoutMs);
      const passed = evaluate(check, stdout, stderr, exitCode);
      if (passed || check.optional) {
        bucket.passed.push(rootDir);
        onProgress?.(canonicalId, rootDir, 'pass');
      } else {
        bucket.failed.push(rootDir);
        bucket.errors[rootDir] = stderr || `Exit code ${exitCode}`;
        onProgress?.(canonicalId, rootDir, 'fail');
      }
    } else if (runIn === 'scopePath') {
      // Run once per unique sub-repo root
      const seen = new Set<string>();
      for (const pkg of packages) {
        if (seen.has(pkg.repo)) {continue;}
        seen.add(pkg.repo);
        const scopeDir = scopePaths.get(pkg.repo) ?? resolve(rootDir, pkg.repo);
        if (!existsSync(scopeDir)) {continue;}

        const { ok, stderr, exitCode, stdout } = runCommand(check.command, resolvedArgs, scopeDir, timeoutMs);
        const passed = evaluate(check, stdout, stderr, exitCode);
        if (passed || check.optional) {
          bucket.passed.push(pkg.repo);
          onProgress?.(canonicalId, pkg.repo, 'pass');
        } else {
          bucket.failed.push(pkg.repo);
          bucket.errors[pkg.repo] = stderr || `Exit code ${exitCode}`;
          onProgress?.(canonicalId, pkg.repo, 'fail');
        }
      }
    } else {
      // perPackage (default): run in each package directory
      for (const pkg of packages) {
        const { ok, stderr, exitCode, stdout } = runCommand(check.command, resolvedArgs, pkg.dir, timeoutMs);
        const passed = evaluate(check, stdout, stderr, exitCode);
        if (passed || check.optional) {
          bucket.passed.push(pkg.name);
          onProgress?.(canonicalId, pkg.name, 'pass');
        } else {
          bucket.failed.push(pkg.name);
          bucket.errors[pkg.name] = stderr || `Exit code ${exitCode}`;
          onProgress?.(canonicalId, pkg.name, 'fail');
        }
      }
    }
  }

  return results;
}
