import { auth, tasks } from "@trigger.dev/sdk";

/**
 * The only door to Trigger.dev from the app, so tests mock this module
 * instead of the SDK. Payloads are task row ids, never content (ADR 0003).
 */
export const triggerClient = {
  async trigger(taskIdentifier: string, payload: { taskId: string }) {
    const handle = await tasks.trigger(taskIdentifier, payload);
    // The handle carries a token that reads only this run, which even a
    // trigger-only API key can hand out.
    return { runId: handle.id, accessToken: handle.publicAccessToken };
  },

  /**
   * A read-only token for one run, to follow it again later (after a page
   * reload). Needs an API key with Runs: Read.
   */
  createRunReadToken(runId: string) {
    return auth.createPublicToken({
      scopes: { read: { runs: [runId] } },
      expirationTime: "2h",
    });
  },
};
