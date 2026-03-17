import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { WorkspacePackage, PackageFilter, SubmoduleInfo } from '@kb-labs/qa-contracts';
import { getSubmoduleInfo } from './submodule-info.js';

/**
 * Discover all workspace packages in the monorepo.
 * Scans pnpm-workspace.yaml patterns from root and all sub-monorepos.
 */
export function getWorkspacePackages(rootDir: string, filter?: PackageFilter): WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];
  // Cache submodule info per repo to avoid redundant git calls
  const submoduleCache = new Map<string, SubmoduleInfo | null>();

  function getSubmoduleCached(entryPath: string, repoName: string): SubmoduleInfo | undefined {
    if (!submoduleCache.has(repoName)) {
      submoduleCache.set(repoName, getSubmoduleInfo(entryPath, repoName));
    }
    return submoduleCache.get(repoName) ?? undefined;
  }

  // Find all sub-monorepos (directories with pnpm-workspace.yaml)
  const entries = readdirSync(rootDir);
  for (const entry of entries) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') {continue;}
    const entryPath = join(rootDir, entry);
    if (!statSync(entryPath).isDirectory()) {continue;}

    const workspaceYaml = join(entryPath, 'pnpm-workspace.yaml');
    if (!existsSync(workspaceYaml)) {continue;}

    const submodule = getSubmoduleCached(entryPath, entry);

    // This is a sub-monorepo — scan its packages/
    const packagesDir = join(entryPath, 'packages');
    if (existsSync(packagesDir) && statSync(packagesDir).isDirectory()) {
      const pkgDirs = readdirSync(packagesDir);
      for (const pkgDir of pkgDirs) {
        const pkgPath = join(packagesDir, pkgDir);
        const pkgJsonPath = join(pkgPath, 'package.json');
        if (!existsSync(pkgJsonPath)) {continue;}

        try {
          const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
          packages.push({
            name: pkgJson.name || pkgDir,
            dir: pkgPath,
            relativePath: relative(rootDir, pkgPath),
            repo: entry,
            submodule,
          });
        } catch {
          // Skip invalid package.json
        }
      }
    }

    // Also check apps/ directory
    const appsDir = join(entryPath, 'apps');
    if (existsSync(appsDir) && statSync(appsDir).isDirectory()) {
      const appDirs = readdirSync(appsDir);
      for (const appDir of appDirs) {
        const appPath = join(appsDir, appDir);
        const pkgJsonPath = join(appPath, 'package.json');
        if (!existsSync(pkgJsonPath)) {continue;}

        try {
          const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
          packages.push({
            name: pkgJson.name || appDir,
            dir: appPath,
            relativePath: relative(rootDir, appPath),
            repo: entry,
            submodule,
          });
        } catch {
          // Skip invalid package.json
        }
      }
    }
  }

  // Apply filters
  if (!filter) {return packages;}

  return packages.filter((pkg) => {
    if (filter.package && !pkg.name.includes(filter.package)) {return false;}
    if (filter.repo && pkg.repo !== filter.repo) {return false;}
    if (filter.scope) {
      const scope = filter.scope.startsWith('@') ? filter.scope : `@${filter.scope}`;
      if (!pkg.name.startsWith(scope)) {return false;}
    }
    return true;
  });
}
