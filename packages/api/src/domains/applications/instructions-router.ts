import { z } from "zod";

import { realtimeSubscriptionSchema } from "@repo/api/domains/tasks/schemas/task";
import { db } from "@repo/api/tools/db";
import { ok, okSchema, openApiMeta } from "@repo/api/tools/openapi";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
} from "@repo/api/tools/trpc";

import { InstructionsService } from "./instructions-service";
import { applicationInstructionsSchema } from "./schemas/instructions";

export const instructionsRouter = createTRPCRouter({
  get: userProcedure
    .meta(
      openApiMeta(
        "instructions",
        "GET",
        "/openings/by-id/{openingId}/instructions",
        "Returns the application instructions, their points and overrides"
      )
    )
    .input(z.object({ openingId: z.uuid() }))
    .output(applicationInstructionsSchema)
    .query(({ ctx, input }) =>
      new InstructionsService(db).get({ userId: ctx.userId, ...input })
    ),

  split: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "instructions",
        "POST",
        "/openings/by-id/{openingId}/instructions",
        "Splits new instructions and gap answers into points to review"
      )
    )
    .input(z.object({ openingId: z.uuid(), text: z.string().max(4000) }))
    .output(z.object({ realtime: realtimeSubscriptionSchema }))
    .mutation(({ ctx, input }) =>
      new InstructionsService(db).split({ userId: ctx.userId, ...input })
    ),

  confirm: userProcedure
    .meta(
      openApiMeta(
        "instructions",
        "POST",
        "/openings/by-id/{openingId}/instructions/confirm",
        "Keeps every draft point and confirms overrides"
      )
    )
    .input(
      z.object({
        openingId: z.uuid(),
        confirmedLockedFactOverrideIds: z.array(z.uuid()),
      })
    )
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new InstructionsService(db).confirm({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  removePoint: userProcedure
    .meta(
      openApiMeta(
        "instructions",
        "DELETE",
        "/openings/by-id/{openingId}/instruction-points/by-id/{instructionPointId}",
        "Removes a point from this application"
      )
    )
    .input(z.object({ openingId: z.uuid(), instructionPointId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new InstructionsService(db).removePoint({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  removeOverride: userProcedure
    .meta(
      openApiMeta(
        "instructions",
        "DELETE",
        "/openings/by-id/{openingId}/locked-fact-overrides/by-id/{lockedFactOverrideId}",
        "Removes a locked-fact override from this application"
      )
    )
    .input(z.object({ openingId: z.uuid(), lockedFactOverrideId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new InstructionsService(db).removeOverride({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),
});
