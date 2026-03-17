import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { runQA, createHistoryEntry, appendEntry } from '@kb-labs/qa-core';
import { CHECK_TYPES } from '@kb-labs/qa-contracts';
import type { QASaveFlags } from './flags.js';

type QASaveInput = QASaveFlags & { argv?: string[]; flags?: any };

export default defineCommand({
  id: 'qa:save',
  description: 'Run QA checks and save results to history',

  handler: {
    async execute(ctx: PluginContextV3, input: QASaveInput) {
      const { ui } = ctx;
      const flags = (input as any).flags ?? input;
      const rootDir = ctx.cwd;

      const startTime = Date.now();
      const { results } = await runQA({ rootDir });
      const durationMs = Date.now() - startTime;
      const entry = createHistoryEntry(results, rootDir);
      appendEntry(rootDir, entry);

      // Track analytics events
      const analytics = ctx.platform.analytics;
      if (analytics) {
        for (const ct of CHECK_TYPES) {
          const r = results[ct];
          await analytics.track('qa.check.completed', {
            checkType: ct,
            status: r.failed.length > 0 ? 'failed' : 'passed',
            passed: r.passed.length,
            failed: r.failed.length,
            skipped: r.skipped.length,
            gitCommit: entry.git.commit,
            gitBranch: entry.git.branch,
          });
        }
        await analytics.track('qa.run.completed', {
          status: entry.status,
          buildPassed: results.build.passed.length, buildFailed: results.build.failed.length,
          lintPassed: results.lint.passed.length, lintFailed: results.lint.failed.length,
          typeCheckPassed: results.typeCheck.passed.length, typeCheckFailed: results.typeCheck.failed.length,
          testPassed: results.test.passed.length, testFailed: results.test.failed.length,
          totalPassed: CHECK_TYPES.reduce((s, ct) => s + results[ct].passed.length, 0),
          totalFailed: CHECK_TYPES.reduce((s, ct) => s + results[ct].failed.length, 0),
          totalSkipped: CHECK_TYPES.reduce((s, ct) => s + results[ct].skipped.length, 0),
          gitCommit: entry.git.commit, gitBranch: entry.git.branch,
          durationMs,
        });
      }

      if (flags.json) {
        ui?.json?.(entry);
        return { exitCode: 0 };
      }

      ui?.success?.('QA state saved to history', {
        title: 'QA Save',
        sections: [{
          header: 'Saved Entry',
          items: [
            `Status: ${entry.status}`,
            `Git: ${entry.git.commit} (${entry.git.branch})`,
            `Message: ${entry.git.message}`,
          ],
        }],
      });

      return { exitCode: 0 };
    },
  },
});
