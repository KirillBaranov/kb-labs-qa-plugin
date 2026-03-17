/**
 * POST /run handler
 *
 * Runs QA checks (build, lint, types, tests) and optionally saves to history.
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { runQA, createHistoryEntry, appendEntry } from '@kb-labs/qa-core';
import type { QARunRequest, QARunResponse } from '@kb-labs/qa-contracts';
import { CHECK_TYPES } from '@kb-labs/qa-contracts';

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<unknown, QARunRequest>,
  ): Promise<QARunResponse> {
    const rootDir = ctx.cwd;
    const startTime = Date.now();
    const body = input.body;

    const { results } = await runQA({
      rootDir,
      skipBuild: body?.skipBuild,
      skipLint: body?.skipLint,
      skipTypes: body?.skipTypes,
      skipTests: body?.skipTests,
    });

    // Determine overall status
    const hasFailed = Object.values(results).some((r) => r.failed.length > 0);
    const status = hasFailed ? 'failed' : 'passed';

    // Save to history unless explicitly disabled
    let entry = null;
    if (body?.saveToHistory !== false) {
      entry = createHistoryEntry(results, rootDir);
      appendEntry(rootDir, entry);
    }

    const durationMs = Date.now() - startTime;

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
          gitCommit: entry?.git.commit, gitBranch: entry?.git.branch,
        });
      }
      await analytics.track('qa.run.completed', {
        status,
        buildPassed: results.build.passed.length, buildFailed: results.build.failed.length,
        lintPassed: results.lint.passed.length, lintFailed: results.lint.failed.length,
        typeCheckPassed: results.typeCheck.passed.length, typeCheckFailed: results.typeCheck.failed.length,
        testPassed: results.test.passed.length, testFailed: results.test.failed.length,
        totalPassed: CHECK_TYPES.reduce((s, ct) => s + results[ct].passed.length, 0),
        totalFailed: CHECK_TYPES.reduce((s, ct) => s + results[ct].failed.length, 0),
        totalSkipped: CHECK_TYPES.reduce((s, ct) => s + results[ct].skipped.length, 0),
        gitCommit: entry?.git.commit, gitBranch: entry?.git.branch,
        durationMs,
      });
    }

    return {
      status,
      results,
      entry,
      durationMs,
    };
  },
});
