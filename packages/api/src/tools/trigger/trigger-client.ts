import { metadata, runs, sessions, tasks } from "@trigger.dev/sdk";

import type { TaskProgress } from "@repo/api/domains/tasks/schemas/task";

/**
 * The only door to Trigger.dev from the app, so tests mock this module
 * instead of the SDK. Payloads are task row ids, never content (ADR 0003).
 */
export const triggerClient = {
  async trigger(
    taskIdentifier: string,
    payload: { taskId: string },
    // Runs sharing a key queue behind each other where the task caps it.
    options?: { concurrencyKey?: string }
  ) {
    const handle = await tasks.trigger(taskIdentifier, payload, options);
    // The handle carries a token that reads only this run, which even a
    // trigger-only API key can hand out.
    return { runId: handle.id, accessToken: handle.publicAccessToken };
  },

  /** Stops a run (the account it works for is being deleted). */
  async cancel(runId: string) {
    await runs.cancel(runId);
  },

  /**
   * Closes an agent chat's session (its account is being deleted).
   * There is no delete: its streams age out with the retention window
   * (ADR 0007).
   */
  async closeSession(chatId: string, reason = "account deleted") {
    await sessions.close(chatId, { reason });
  },

  /** Stops the live runs of an agent chat (its document is being deleted). */
  async cancelChatRuns(chatId: string) {
    const live = await runs.list({
      tag: `chat:${chatId}`,
      status: ["EXECUTING", "WAITING", "QUEUED", "DEQUEUED"],
    });
    for await (const run of live) {
      await runs.cancel(run.id);
    }
  },

  /** Inside a run: mirrors progress to the browser through Realtime. */
  reportProgress(progress: TaskProgress) {
    metadata.set("progress", progress);
  },
};
