"use client";

import { useRealtimeRun } from "@trigger.dev/react-hooks";

import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";

/** Calls `onDone` when a task's run finishes, following it through Realtime. */
export function RunWatcher({
  runId,
  accessToken,
  onDone,
}: RealtimeSubscription & { onDone: () => void }) {
  useRealtimeRun(runId, { accessToken, onComplete: () => onDone() });
  return null;
}
