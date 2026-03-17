import { defineCommand, useConfig, type PluginContextV3 } from '@kb-labs/sdk';
import type { QAPluginConfig } from '@kb-labs/qa-contracts';
import { CHECK_TYPES } from '@kb-labs/qa-contracts';
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

      const startTime = Date.now();
      const { results, packages } = await runQA({
        rootDir,
        skipBuild: !!flags['skip-build'],
        skipLint: !!flags['skip-lint'],
        skipTypes: !!flags['skip-types'],
        skipTests: !!flags['skip-tests'],
        noCache: !!flags['no-cache'],
        package: flags.package as string | undefined,
        repo: flags.repo as string | undefined,
        scope: flags.scope as string | undefined,
      });
      const durationMs = Date.now() - startTime;

      // Track analytics events
      const analytics = ctx.platform.analytics;
      if (analytics) {
        const hasFails = Object.values(results).some((r) => r.failed.length > 0);
        for (const ct of CHECK_TYPES) {
          const r = results[ct];
          await analytics.track('qa.check.completed', {
            checkType: ct,
            status: r.failed.length > 0 ? 'failed' : 'passed',
            passed: r.passed.length,
            failed: r.failed.length,
            skipped: r.skipped.length,
          });
        }
        await analytics.track('qa.run.completed', {
          status: hasFails ? 'failed' : 'passed',
          buildPassed: results.build.passed.length, buildFailed: results.build.failed.length,
          lintPassed: results.lint.passed.length, lintFailed: results.lint.failed.length,
          typeCheckPassed: results.typeCheck.passed.length, typeCheckFailed: results.typeCheck.failed.length,
          testPassed: results.test.passed.length, testFailed: results.test.failed.length,
          totalPassed: CHECK_TYPES.reduce((s, ct) => s + results[ct].passed.length, 0),
          totalFailed: CHECK_TYPES.reduce((s, ct) => s + results[ct].failed.length, 0),
          totalSkipped: CHECK_TYPES.reduce((s, ct) => s + results[ct].skipped.length, 0),
          durationMs,
        });
      }

      // Compare with baseline if available
      const baseline = loadBaseline(rootDir);
      const diff = baseline ? compareWithBaseline(results, baseline) : null;

      // Load plugin config for categories
      let config: QAPluginConfig | undefined;
      try {
        config = await useConfig<QAPluginConfig>('qa');
      } catch {
        // Config not available (no platform context) — proceed without categories
      }

      const categoryMap = resolveCategories(packages, config);
      const grouped = groupResults(results, packages, categoryMap, config);

      if (flags.json) {
        const report = buildDetailedJsonReport(results, grouped, diff);
        ui?.json?.(report);
        return { exitCode: report.status === 'failed' ? 1 : 0 };
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
