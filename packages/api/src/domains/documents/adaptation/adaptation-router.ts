import { z } from "zod";

import { realtimeSubscriptionSchema } from "@repo/api/domains/tasks/schemas/task";
import { db } from "@repo/api/tools/db";
import { ok, okSchema, openApiMeta } from "@repo/api/tools/openapi";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
} from "@repo/api/tools/trpc";

import { outputLanguageSchema } from "../schemas/document";
import { AdaptationService } from "./adaptation-service";
import { syncChangeSchema } from "./three-way-merge";

const started = z.object({
  generationId: z.uuid(),
  realtime: realtimeSubscriptionSchema,
});

export const adaptationRouter = createTRPCRouter({
  adapt: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "adaptation",
        "POST",
        "/document-versions/by-id/{versionId}/adaptations",
        "Adapts the version into another language, or recreates a target from it"
      )
    )
    .input(
      z.object({
        versionId: z.uuid(),
        language: outputLanguageSchema,
        targetVersionId: z.uuid().optional(),
      })
    )
    .output(started)
    .mutation(({ ctx, input }) =>
      new AdaptationService(db).adapt({ userId: ctx.userId, ...input })
    ),

  syncPreview: userProcedure
    .meta(
      openApiMeta(
        "adaptation",
        "GET",
        "/document-versions/by-id/{versionId}/sync",
        "Lists the changes a linked version has that this one has not received"
      )
    )
    .input(z.object({ versionId: z.uuid(), fromVersionId: z.uuid() }))
    .output(
      z.object({
        changes: z.array(syncChangeSchema),
        baseMissing: z.boolean(),
        // Passed back to start the sync, so nothing unseen is carried.
        sourceSnapshotId: z.uuid(),
      })
    )
    .query(({ ctx, input }) =>
      new AdaptationService(db).syncPreview({ userId: ctx.userId, ...input })
    ),

  startSync: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "adaptation",
        "POST",
        "/document-versions/by-id/{versionId}/sync",
        "Carries the selected changes into this version as a proposal"
      )
    )
    .input(
      z.object({
        versionId: z.uuid(),
        fromVersionId: z.uuid(),
        sourceSnapshotId: z.uuid(),
        lineIds: z.array(z.string()).min(1),
      })
    )
    .output(started)
    .mutation(({ ctx, input }) =>
      new AdaptationService(db).startSync({ userId: ctx.userId, ...input })
    ),

  acceptSync: userProcedure
    .meta(
      openApiMeta(
        "adaptation",
        "POST",
        "/generations/by-id/{generationId}/accept",
        "Accepts a sync proposal as the target's new latest snapshot"
      )
    )
    .input(z.object({ generationId: z.uuid() }))
    .output(z.object({ snapshotId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      new AdaptationService(db).acceptSync({ userId: ctx.userId, ...input })
    ),

  discardSync: userProcedure
    .meta(
      openApiMeta(
        "adaptation",
        "POST",
        "/generations/by-id/{generationId}/discard",
        "Discards a sync proposal"
      )
    )
    .input(z.object({ generationId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new AdaptationService(db).discardSync({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  approveTitle: userProcedure
    .meta(
      openApiMeta(
        "adaptation",
        "PUT",
        "/positions/by-id/{positionId}/title-equivalent",
        "Approves a position's title in the version's language"
      )
    )
    .input(
      z.object({
        versionId: z.uuid(),
        positionId: z.uuid(),
        title: z.string().trim().min(1).max(200),
      })
    )
    .output(z.object({ snapshotId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      new AdaptationService(db).approveTitle({ userId: ctx.userId, ...input })
    ),
});
