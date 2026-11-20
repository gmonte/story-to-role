import { z } from "zod";

import { realtimeSubscriptionSchema } from "@repo/api/domains/tasks/schemas/task";
import { db } from "@repo/api/tools/db";
import { ok, okSchema, openApiMeta } from "@repo/api/tools/openapi";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
} from "@repo/api/tools/trpc";

import { linkedinInterviewViewSchema } from "../schemas/linkedin-interview";
import { LinkedinInterviewService } from "./linkedin-interview-service";

// `headline`, `about`, `experiences`, `projects`, `education`, or the id
// of one position, project or education.
const section = z.string().min(1).max(64);

export const linkedinInterviewRouter = createTRPCRouter({
  get: userProcedure
    .meta(
      openApiMeta(
        "linkedin",
        "GET",
        "/linkedin/versions/by-id/{versionId}/interview",
        "Returns a LinkedIn step's questions, answers and instructions"
      )
    )
    .input(z.object({ versionId: z.uuid(), section }))
    .output(linkedinInterviewViewSchema)
    .query(({ ctx, input }) =>
      new LinkedinInterviewService(db).get({ userId: ctx.userId, ...input })
    ),

  start: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "linkedin",
        "POST",
        "/linkedin/versions/by-id/{versionId}/interview",
        "Starts (or starts over) a LinkedIn step's questions"
      )
    )
    .input(z.object({ versionId: z.uuid(), section }))
    .output(
      z.object({ interviewId: z.uuid(), realtime: realtimeSubscriptionSchema })
    )
    .mutation(({ ctx, input }) =>
      new LinkedinInterviewService(db).start({ userId: ctx.userId, ...input })
    ),

  answer: userProcedure
    // A chat answer: a person types, a script bursts.
    .use(rateLimited("chatMessage"))
    .meta(
      openApiMeta(
        "linkedin",
        "POST",
        "/linkedin/interviews/by-id/{interviewId}/answers",
        "Answers a LinkedIn step's current question"
      )
    )
    .input(
      z.object({
        interviewId: z.uuid(),
        text: z.string().trim().min(1).max(2000),
      })
    )
    .output(z.object({ realtime: realtimeSubscriptionSchema }))
    .mutation(({ ctx, input }) =>
      new LinkedinInterviewService(db).answer({ userId: ctx.userId, ...input })
    ),

  skip: userProcedure
    .meta(
      openApiMeta(
        "linkedin",
        "POST",
        "/linkedin/interviews/by-id/{interviewId}/skip",
        "Skips the rest of a LinkedIn step's questions"
      )
    )
    .input(z.object({ interviewId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new LinkedinInterviewService(db).skip({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  removeInstruction: userProcedure
    .meta(
      openApiMeta(
        "linkedin",
        "DELETE",
        "/linkedin/instructions/by-id/{linkedinInstructionId}",
        "Removes a LinkedIn instruction: the writer no longer reads it"
      )
    )
    .input(z.object({ linkedinInstructionId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new LinkedinInterviewService(db).removeInstruction({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),
});
