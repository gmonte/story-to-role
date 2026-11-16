import { schedules } from "@trigger.dev/sdk";

import { db } from "@repo/api/tools/db";

import { TrackerService } from "../tracker-service";

/** Tracker spec: "No response" closes stale applications, daily. */
export const closeUnansweredTask = schedules.task({
  id: "close_unanswered_applications",
  cron: "0 5 * * *",
  run: () => new TrackerService(db).closeUnanswered(),
});
