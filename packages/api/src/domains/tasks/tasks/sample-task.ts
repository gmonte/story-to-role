import { task } from "@trigger.dev/sdk";

import { db } from "@repo/api/tools/db";

import { runTask } from "../run-task";

const TOTAL_STEPS = 5;

/**
 * A harmless task that proves the pipeline end to end: triggered from the
 * app with only an id, it reports progress the browser follows live.
 */
export const sampleTask = task({
  id: "sample",
  retry: { maxAttempts: 1 },
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "sample" },
      async ({ reportProgress }) => {
        for (let step = 1; step <= TOTAL_STEPS; step++) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await reportProgress({ step, totalSteps: TOTAL_STEPS });
        }
      }
    );
  },
});
