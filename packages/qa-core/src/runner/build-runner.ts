import { execSync } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckResult, WorkspacePackage } from '@kb-labs/qa-contracts';

interface BuildRunnerOptions {
  rootDir: string;
  packages: WorkspacePackage[];
  noCache?: boolean;
  onProgress?: (pkg: string, status: 'pass' | 'fail' | 'skip') => void;
}

/**
 * Check if a package needs rebuilding by comparing src/ mtime vs dist/ mtime.
 */
function needsRebuild(pkgDir: string): boolean {
  const srcDir = join(pkgDir, 'src');
  const distDir = join(pkgDir, 'dist');

  if (!existsSync(distDir)) {return true;}
  if (!existsSync(srcDir)) {return false;}

  const srcMtime = getLatestMtime(srcDir);
  const distMtime = getLatestMtime(distDir);

  return srcMtime > distMtime;
}

function getLatestMtime(dir: string): number {
  let latest = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        latest = Math.max(latest, getLatestMtime(fullPath));
      } else {
        latest = Math.max(latest, statSync(fullPath).mtimeMs);
      }
    }
  } catch {
    // ignore
  }
  return latest;
}

/**
 * Get build layers via topological sort.
 * Falls back to flat list if kb-devkit-build-order is not available.
 */
function getBuildLayers(rootDir: string): string[][] {
  try {
    const output = execSync('npx kb-devkit-build-order --layers --json', {
      cwd: rootDir,
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed.layers)) {
      return parsed.layers;
    }
  } catch {
    // Fallback — no layers available
  }
  return [];
}

/**
 * Run build checks across all packages.
 * Uses incremental builds — only rebuilds packages where src/ is newer than dist/.
 */
export function runBuildCheck(options: BuildRunnerOptions): CheckResult {
  const { rootDir, packages, noCache, onProgress } = options;
  const result: CheckResult = { passed: [], failed: [], skipped: [], errors: {} };

  for (const pkg of packages) {
    // Check if rebuild needed (incremental)
    if (!noCache && !needsRebuild(pkg.dir)) {
      result.skipped.push(pkg.name);
      onProgress?.(pkg.name, 'skip');
      continue;
    }

    try {
      execSync('pnpm run build', {
        cwd: pkg.dir,
        encoding: 'utf-8',
        timeout: 120000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      result.passed.push(pkg.name);
      onProgress?.(pkg.name, 'pass');
    } catch (err: any) {
      result.failed.push(pkg.name);
      const rawErr = (err.stderr || err.stdout || err.message || '').trim();
      result.errors[pkg.name] = rawErr.slice(0, 2000) || `Build failed (exit code ${err.status ?? 1})`;
      onProgress?.(pkg.name, 'fail');
    }
  }

  return result;
}
