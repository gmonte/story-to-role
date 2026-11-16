import { z } from "zod";

import { sensitivityChoiceSchema } from "@repo/api/domains/evidence/schemas/evidence";
import { db } from "@repo/api/tools/db";
import { ok, okSchema, openApiMeta } from "@repo/api/tools/openapi";
import { createTRPCRouter, userProcedure } from "@repo/api/tools/trpc";

import { applicationOverrideItemSchema } from "../schemas/overrides";
import { OverridesService } from "./overrides-service";

const itemInput = z.object({
  openingId: z.uuid(),
  sensitiveItemId: z.uuid(),
});

export const overridesRouter = createTRPCRouter({
  list: userProcedure
    .meta(
      openApiMeta(
        "applications",
        "GET",
        "/openings/by-id/{openingId}/sensitive-overrides",
        "Lists the sensitive items with this application's own choices"
      )
    )
    .input(z.object({ openingId: z.uuid() }))
    .output(z.array(applicationOverrideItemSchema))
    .query(({ ctx, input }) =>
      new OverridesService(db).list({ userId: ctx.userId, ...input })
    ),

  set: userProcedure
    .meta(
      openApiMeta(
        "applications",
        "PUT",
        "/openings/by-id/{openingId}/sensitive-overrides/by-id/{sensitiveItemId}",
        "Sets a sensitive item's choice for this application only"
      )
    )
    .input(
      itemInput.extend({
        choice: sensitivityChoiceSchema,
        generalized: z.string().trim().max(300).optional(),
      })
    )
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new OverridesService(db).set({ userId: ctx.userId, ...input });
      return ok;
    }),

  remove: userProcedure
    .meta(
      openApiMeta(
        "applications",
        "DELETE",
        "/openings/by-id/{openingId}/sensitive-overrides/by-id/{sensitiveItemId}",
        "Goes back to the item's general choice for this application"
      )
    )
    .input(itemInput)
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new OverridesService(db).remove({ userId: ctx.userId, ...input });
      return ok;
    }),
});
