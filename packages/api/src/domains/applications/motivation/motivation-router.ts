import { z } from "zod";

import { realtimeSubscriptionSchema } from "@repo/api/domains/tasks/schemas/task";
import { db } from "@repo/api/tools/db";
import { ok, okSchema, openApiMeta } from "@repo/api/tools/openapi";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
} from "@repo/api/tools/trpc";

import {
  motivationDecisionSchema,
  motivationSendResultSchema,
  motivationViewSchema,
} from "../schemas/motivation";
import { MotivationService } from "./motivation-service";

const started = z.object({ realtime: realtimeSubscriptionSchema });

export const motivationRouter = createTRPCRouter({
  get: userProcedure
    .meta(
      openApiMeta(
        "motivation",
        "GET",
        "/openings/by-id/{openingId}/motivation",
        "Returns the motivation interview, its turns and points"
      )
    )
    .input(z.object({ openingId: z.uuid() }))
    .output(motivationViewSchema)
    .query(({ ctx, input }) =>
      new MotivationService(db).get({ userId: ctx.userId, ...input })
    ),

  start: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "motivation",
        "POST",
        "/openings/by-id/{openingId}/motivation",
        "Starts the motivation interview"
      )
    )
    .input(
      z.object({
        openingId: z.uuid(),
        // The story the letter will tell (a line from letter.stories): the
        // interview then asks about its turning point.
        storyLineId: z.string().optional(),
      })
    )
    .output(started)
    .mutation(({ ctx, input }) =>
      new MotivationService(db).start({ userId: ctx.userId, ...input })
    ),

  answer: userProcedure
    // A chat answer: a person types, a script bursts.
    .use(rateLimited("chatMessage"))
    .meta(
      openApiMeta(
        "motivation",
        "POST",
        "/openings/by-id/{openingId}/motivation/answers",
        "Answers the interview's current question"
      )
    )
    .input(
      z.object({
        openingId: z.uuid(),
        text: z.string().trim().min(1).max(2000),
      })
    )
    .output(started)
    .mutation(({ ctx, input }) =>
      new MotivationService(db).answer({ userId: ctx.userId, ...input })
    ),

  skip: userProcedure
    .meta(
      openApiMeta(
        "motivation",
        "POST",
        "/openings/by-id/{openingId}/motivation/skip",
        "Skips the motivation interview"
      )
    )
    .input(z.object({ openingId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new MotivationService(db).skip({ userId: ctx.userId, ...input });
      return ok;
    }),

  confirm: userProcedure
    .meta(
      openApiMeta(
        "motivation",
        "POST",
        "/openings/by-id/{openingId}/motivation/confirm",
        "Suggests the chosen points to the profile's career direction or the story's experience"
      )
    )
    .input(
      z.object({
        openingId: z.uuid(),
        decisions: z.array(motivationDecisionSchema).max(50),
      })
    )
    .output(z.object({ sent: z.array(motivationSendResultSchema) }))
    .mutation(({ ctx, input }) =>
      new MotivationService(db).confirm({ userId: ctx.userId, ...input })
    ),
});
