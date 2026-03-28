import { defineCommand, useConfig, type PluginContextV3 } from '@kb-labs/sdk';
import type { QAPluginConfig } from '@kb-labs/qa-contracts';
import {
  runQA,
  compareWithBaseline,
  loadBaseline,
  buildDetailedJsonReport,
  buildRunReport,
  buildDetailedRunReport,
  resolveCategories,
  groupResults,
} from '@kb-labs/qa-core';
import type { QARunFlags } from './flags.js';

type QARunInput = QARunFlags & { argv?: string[]; flags?: any };

export default defineCommand({
  id: 'qa:run',
  description: 'Run all QA checks (build, lint, types, tests)',

  handler: {
    async execute(ctx: PluginContextV3, input: QARunInput) {
      const { ui } = ctx;
      const flags = (input as any).flags ?? input;
      const rootDir = ctx.cwd;

      // Load plugin config — needed for package discovery and checks.
      // useConfig() can hang if platform IPC is unavailable, so race with a timeout.
      let config: QAPluginConfig | undefined;
      try {
        config = await Promise.race([
          useConfig<QAPluginConfig>(),
          new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 3000)),
        ]);
      } catch {
        // Config not available (no platform context) — proceed without config
      }

      // Select checks: per-scope override → global checks → built-in runners
      const scopeKey = flags.scope as string | undefined;
      const checks = (scopeKey ? config?.scopes?.[scopeKey]?.checks : undefined)
        ?? config?.checks;

      const rawSkip = flags['skip-check'];
      const skipChecks: string[] = Array.isArray(rawSkip)
        ? rawSkip as string[]
        : rawSkip ? [rawSkip as string] : [];

      const startTime = Date.now();
      const { results, packages } = await runQA({
        rootDir,
        skipChecks,
        noCache: !!flags['no-cache'],
        package: flags.package as string | undefined,
        repo: flags.repo as string | undefined,
        scope: scopeKey,
        packagesConfig: config?.packages,
        checks,
      });
      const durationMs = Date.now() - startTime;

      // Track analytics events
      const analytics = ctx.platform.analytics;
      if (analytics) {
        const hasFails = Object.values(results).some((r) => r.failed.length > 0);
        for (const ct of Object.keys(results)) {
          const r = results[ct]!;
          await analytics.track('qa.check.completed', {
            checkType: ct,
            status: r.failed.length > 0 ? 'failed' : 'passed',
            passed: r.passed.length,
            failed: r.failed.length,
            skipped: r.skipped.length,
          });
        }
        const checkKeys = Object.keys(results);
        await analytics.track('qa.run.completed', {
          status: hasFails ? 'failed' : 'passed',
          ...Object.fromEntries(checkKeys.flatMap((ct) => [
            [`${ct}Passed`, results[ct]!.passed.length],
            [`${ct}Failed`, results[ct]!.failed.length],
          ])),
          totalPassed: checkKeys.reduce((s, ct) => s + results[ct]!.passed.length, 0),
          totalFailed: checkKeys.reduce((s, ct) => s + results[ct]!.failed.length, 0),
          totalSkipped: checkKeys.reduce((s, ct) => s + results[ct]!.skipped.length, 0),
          durationMs,
        });
      }

      // Compare with baseline if available
      const baseline = loadBaseline(rootDir);
      const diff = baseline ? compareWithBaseline(results, baseline) : null;

      const categoryMap = resolveCategories(packages, config);
      const grouped = groupResults(results, packages, categoryMap, config);

      if (flags.json) {
        const report = buildDetailedJsonReport(results, grouped, diff);
        ui?.json?.({ ...report, skippedChecks: skipChecks });
        return { exitCode: report.status === 'failed' ? 1 : 0 };
      }

      // Show skipped checks section for easier debugging
      if (skipChecks.length > 0) {
        ui?.success?.('Skipped checks', {
          title: 'Skipped checks',
          sections: [{ header: '', items: skipChecks.map(c => `  - ${c}`) }],
        });
      }

      if (flags.summary) {
        // Legacy summary format
        const sections = buildRunReport(results, diff);
        for (const section of sections) {
          ui?.success?.(section.header, {
            title: section.header,
            sections: [{ header: '', items: section.lines }],
          });
        }
      } else {
        // Detailed report grouped by category → repo
        const sections = buildDetailedRunReport(grouped, diff);
        for (const section of sections) {
          ui?.success?.(section.header, {
            title: section.header,
            sections: [{ header: '', items: section.lines }],
          });
        }
      }

      const hasFails = Object.values(results).some((r) => r.failed.length > 0);
      return { exitCode: hasFails ? 1 : 0 };
    },
  },
});
