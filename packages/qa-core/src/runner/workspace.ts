import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { WorkspacePackage, PackageFilter, SubmoduleInfo } from '@kb-labs/qa-contracts';
import type { PackagesConfig } from '@kb-labs/qa-contracts';
import { getSubmoduleInfo } from './submodule-info.js';

/**
 * Discover all workspace packages in the monorepo.
 *
 * If packagesConfig.paths is set, use those glob-expanded paths to find sub-monorepos.
 * Otherwise fall back to auto-scan (supports both flat and nested layouts).
 */
export function getWorkspacePackages(
  rootDir: string,
  filter?: PackageFilter,
  packagesConfig?: PackagesConfig,
): WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];
  // Cache submodule info per repo to avoid redundant git calls
  const submoduleCache = new Map<string, SubmoduleInfo | null>();

  function getSubmoduleCached(entryPath: string, repoName: string): SubmoduleInfo | undefined {
    if (!submoduleCache.has(repoName)) {
      submoduleCache.set(repoName, getSubmoduleInfo(entryPath, repoName));
    }
    return submoduleCache.get(repoName) ?? undefined;
  }

  // Build list of candidate sub-repo directories
  const candidates: string[] = [];

  if (packagesConfig?.paths && packagesConfig.paths.length > 0) {
    // Config-driven: expand each path pattern (simple glob: "platform/*" → all dirs in platform/)
    for (const pattern of packagesConfig.paths) {
      const parts = pattern.split('/');
      if (parts.length === 2 && parts[1] === '*' && parts[0]) {
        // "category/*" — scan all subdirs of category
        const categoryDir = join(rootDir, parts[0]);
        if (!existsSync(categoryDir) || !statSync(categoryDir).isDirectory()) {continue;}
        try {
          for (const sub of readdirSync(categoryDir)) {
            if (sub.startsWith('.') || sub === 'node_modules') {continue;}
            const subPath = join(categoryDir, sub);
            if (statSync(subPath).isDirectory() && existsSync(join(subPath, 'pnpm-workspace.yaml'))) {
              candidates.push(subPath);
            }
          }
        } catch { /* skip unreadable dirs */ }
      } else {
        // Exact path (e.g. "installer/kb-labs-create")
        const exactPath = join(rootDir, pattern);
        if (existsSync(exactPath) && statSync(exactPath).isDirectory() && existsSync(join(exactPath, 'pnpm-workspace.yaml'))) {
          candidates.push(exactPath);
        }
      }
    }
  } else {
    // Auto-scan: support both flat layout (sub-repos in root) and nested layout
    // (sub-repos inside category dirs like platform/, plugins/, infra/)
    const rootEntries = readdirSync(rootDir);
    for (const entry of rootEntries) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') {continue;}
      const entryPath = join(rootDir, entry);
      if (!statSync(entryPath).isDirectory()) {continue;}
      if (existsSync(join(entryPath, 'pnpm-workspace.yaml'))) {
        // Flat layout: sub-repo directly in root
        candidates.push(entryPath);
      } else {
        // Nested layout: category dir — scan one level deeper
        try {
          for (const sub of readdirSync(entryPath)) {
            if (sub.startsWith('.') || sub === 'node_modules') {continue;}
            const subPath = join(entryPath, sub);
            if (statSync(subPath).isDirectory() && existsSync(join(subPath, 'pnpm-workspace.yaml'))) {
              candidates.push(subPath);
            }
          }
        } catch { /* skip unreadable dirs */ }
      }
    }
  }

  // Scan each candidate sub-monorepo for packages
  for (const entryPath of candidates) {
    const entry = relative(rootDir, entryPath);
    const submodule = getSubmoduleCached(entryPath, entry);

    // Scan packages/ directory
    const packagesDir = join(entryPath, 'packages');
    if (existsSync(packagesDir) && statSync(packagesDir).isDirectory()) {
      for (const pkgDir of readdirSync(packagesDir)) {
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
        } catch { /* skip invalid package.json */ }
      }
    }

    // Also scan apps/ directory
    const appsDir = join(entryPath, 'apps');
    if (existsSync(appsDir) && statSync(appsDir).isDirectory()) {
      for (const appDir of readdirSync(appsDir)) {
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
        } catch { /* skip invalid package.json */ }
      }
    }
  }

  // Apply packagesConfig include/exclude filters
  let filtered = packages;
  if (packagesConfig?.include && packagesConfig.include.length > 0) {
    filtered = filtered.filter(pkg =>
      packagesConfig.include!.some(pattern => matchesPattern(pkg.name, pkg.repo, pattern))
    );
  }
  if (packagesConfig?.exclude && packagesConfig.exclude.length > 0) {
    filtered = filtered.filter(pkg =>
      !packagesConfig.exclude!.some(pattern => matchesPattern(pkg.name, pkg.repo, pattern))
    );
  }

  // Apply per-run CLI filters (--package, --repo, --scope)
  if (!filter) {return filtered;}

  return filtered.filter((pkg) => {
    if (filter.package && !pkg.name.includes(filter.package)) {return false;}
    if (filter.repo && pkg.repo !== filter.repo) {return false;}
    if (filter.scope) {
      const scope = filter.scope.startsWith('@') ? filter.scope : `@${filter.scope}`;
      if (!pkg.name.startsWith(scope)) {return false;}
    }
    return true;
  });
}

/**
 * Match a package against a pattern.
 * Supports: exact name, "@kb-labs/core-*" glob, "kb-labs-cli/*" repo prefix.
 */
function matchesPattern(name: string, repo: string, pattern: string): boolean {
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return repo === prefix || repo.startsWith(prefix + '/');
  }
  if (pattern.endsWith('*')) {
    return name.startsWith(pattern.slice(0, -1));
  }
  return name === pattern || repo === pattern;
}
