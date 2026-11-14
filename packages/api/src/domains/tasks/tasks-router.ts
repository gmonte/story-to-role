import { z } from "zod";

import { db } from "@repo/api/tools/db";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
} from "@repo/api/tools/trpc";

import { taskSchema } from "./schemas/task";
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
      z.object({
        task: taskSchema,
        realtime: z.object({ runId: z.string(), accessToken: z.string() }),
      })
    )
    .mutation(({ ctx }) =>
      new TasksService(db).start({ userId: ctx.userId, type: "sample" })
    ),

  byId: userProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/tasks/by-id/{taskId}",
        tags: ["tasks"],
        summary: "Returns one of the current user's tasks",
        protect: true,
      },
    })
    .input(z.object({ taskId: z.uuid() }))
    .output(taskSchema)
    .query(({ ctx, input }) =>
      new TasksService(db).getForUser({
        taskId: input.taskId,
        userId: ctx.userId,
      })
    ),

  realtimeToken: userProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/tasks/by-id/{taskId}/realtime-token",
        tags: ["tasks"],
        summary: "Returns a read-only token to follow the task's run live",
        protect: true,
      },
    })
    .input(z.object({ taskId: z.uuid() }))
    .output(z.object({ runId: z.string(), accessToken: z.string() }))
    .mutation(({ ctx, input }) =>
      new TasksService(db).createRealtimeToken({
        taskId: input.taskId,
        userId: ctx.userId,
      })
    ),
});
