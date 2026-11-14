import { z } from "zod";

import { db } from "@repo/api/tools/db";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
} from "@repo/api/tools/trpc";

import { realtimeSubscriptionSchema, taskSchema } from "./schemas/task";
import { TasksService } from "./tasks-service";

export const tasksRouter = createTRPCRouter({
  startSample: userProcedure
    .use(rateLimited("taskStart"))
    .meta({
      openapi: {
        method: "POST",
        path: "/tasks/sample",
        tags: ["tasks"],
        summary: "Starts the sample task that demonstrates live progress",
        protect: true,
      },
    })
    .input(z.object({}))
    .output(
      z.object({ task: taskSchema, realtime: realtimeSubscriptionSchema })
    )
    .mutation(({ ctx }) =>
      new TasksService(db).start({ userId: ctx.userId, type: "sample" })
    ),
});
