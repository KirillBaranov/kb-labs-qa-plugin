import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { loadHistory, analyzeTrends, buildTrendsReport } from '@kb-labs/qa-core';
import type { QATrendsFlags } from './flags.js';

type QATrendsInput = QATrendsFlags & { argv?: string[]; flags?: any };

export default defineCommand({
  id: 'qa:trends',
  description: 'Show QA quality trends over time',

  handler: {
    async execute(ctx: PluginContextV3, input: QATrendsInput) {
      const { ui } = ctx;
      const flags = (input as any).flags ?? input;
      const rootDir = ctx.cwd;

      const history = loadHistory(rootDir);
      const window = typeof flags.window === 'number' ? flags.window : 10;
      const trends = analyzeTrends(history, window);

      if (flags.json) {
        ui?.json?.({ trends, window, entries: history.length });
        return { exitCode: 0 };
      }

      const sections = buildTrendsReport(trends, history);
      for (const section of sections) {
        ui?.success?.(section.header, {
          title: section.header,
          sections: [{ header: '', items: section.lines }],
        });
      }

      return { exitCode: 0 };
    },
  },
});
