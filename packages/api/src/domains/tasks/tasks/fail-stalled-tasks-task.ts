import { schedules } from "@trigger.dev/sdk";

import { OpeningsService } from "@repo/api/domains/openings/openings-service";
import { db } from "@repo/api/tools/db";

import { TasksService } from "../tasks-service";

/**
 * A run that dies (a crash, a deploy) never marks its task: every ten
 * minutes, the tasks past their time are failed and what waited on them is
 * told, so no page shows work that stopped as still going.
 */
export const failStalledTasksTask = schedules.task({
  id: "fail_stalled_tasks",
  cron: "*/10 * * * *",
  run: async () => {
    await new TasksService(db).failStalled();
    await new OpeningsService(db).failStuckAnalyses();
  },
});
