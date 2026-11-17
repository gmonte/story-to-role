import { z } from "zod";

import { toneSchema } from "@repo/api/domains/openings/schemas/opening";
import { realtimeSubscriptionSchema } from "@repo/api/domains/tasks/schemas/task";
import { db } from "@repo/api/tools/db";
import { ok, okSchema, openApiMeta } from "@repo/api/tools/openapi";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
} from "@repo/api/tools/trpc";

import { generationSettingsFields } from "./schemas/generation-settings";
import { DocumentsService } from "./documents-service";
import { PdfService } from "./rendering/pdf-service";
import {
  outputLanguageSchema,
  reviewDepthSchema,
  writingLevelSchema,
} from "./schemas/document";
import {
  openingDocumentsSchema,
  snapshotSummarySchema,
} from "./schemas/document-view";
import { documentContentSchema } from "./schemas/document-content";
import { resumeSectionKindSchema } from "./schemas/resume-content";

const snapshotRef = z.object({ snapshotId: z.uuid() });

export const documentsRouter = createTRPCRouter({
  forOpening: userProcedure
    .meta(
      openApiMeta(
        "documents",
        "GET",
        "/openings/by-id/{openingId}/documents",
        "Returns the opening's application and its documents"
      )
    )
    .input(z.object({ openingId: z.uuid() }))
    .output(openingDocumentsSchema)
    .query(({ ctx, input }) =>
      new DocumentsService(db).forOpening({ userId: ctx.userId, ...input })
    ),

  generateResume: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "documents",
        "POST",
        "/openings/by-id/{openingId}/resume",
        "Generates a resume for the opening, starting its application"
      )
    )
    .input(
      z.object({
        openingId: z.uuid(),
        language: outputLanguageSchema,
        reviewDepth: reviewDepthSchema,
        writingLevel: writingLevelSchema,
        tone: toneSchema,
        versionId: z.uuid().optional(),
        sectionsForcedIn: z.array(resumeSectionKindSchema).optional(),
        sectionsForcedOut: z.array(resumeSectionKindSchema).optional(),
        referenceVersionId: z.uuid().optional(),
        settings: generationSettingsFields.partial().optional(),
      })
    )
    .output(
      z.object({ generationId: z.uuid(), realtime: realtimeSubscriptionSchema })
    )
    .mutation(({ ctx, input }) =>
      new DocumentsService(db).generateResume({ userId: ctx.userId, ...input })
    ),

  saveEdit: userProcedure
    .meta(
      openApiMeta(
        "documents",
        "POST",
        "/document-versions/by-id/{versionId}/snapshots",
        "Saves the user's edit as a new snapshot"
      )
    )
    .input(
      z.object({
        versionId: z.uuid(),
        baseSnapshotId: z.uuid(),
        content: documentContentSchema,
      })
    )
    .output(snapshotRef)
    .mutation(({ ctx, input }) =>
      new DocumentsService(db).saveEdit({ userId: ctx.userId, ...input })
    ),

  undo: userProcedure
    .meta(
      openApiMeta(
        "documents",
        "POST",
        "/document-versions/by-id/{versionId}/undo",
        "Deletes the version's latest snapshot"
      )
    )
    .input(z.object({ versionId: z.uuid() }))
    .output(snapshotRef)
    .mutation(({ ctx, input }) =>
      new DocumentsService(db).undo({ userId: ctx.userId, ...input })
    ),

  history: userProcedure
    .meta(
      openApiMeta(
        "documents",
        "GET",
        "/document-versions/by-id/{versionId}/snapshots",
        "Lists the version's change history, newest first"
      )
    )
    .input(z.object({ versionId: z.uuid() }))
    .output(z.array(snapshotSummarySchema))
    .query(({ ctx, input }) =>
      new DocumentsService(db).history({ userId: ctx.userId, ...input })
    ),

  snapshot: userProcedure
    .meta(
      openApiMeta(
        "documents",
        "GET",
        "/document-snapshots/by-id/{snapshotId}",
        "Returns one snapshot's content"
      )
    )
    .input(snapshotRef)
    .output(snapshotSummarySchema.extend({ content: documentContentSchema }))
    .query(({ ctx, input }) =>
      new DocumentsService(db).snapshot({ userId: ctx.userId, ...input })
    ),

  restore: userProcedure
    .meta(
      openApiMeta(
        "documents",
        "POST",
        "/document-snapshots/by-id/{snapshotId}/restore",
        "Restores an old change as the version's new latest snapshot"
      )
    )
    .input(snapshotRef)
    .output(snapshotRef)
    .mutation(({ ctx, input }) =>
      new DocumentsService(db).restore({ userId: ctx.userId, ...input })
    ),

  duplicate: userProcedure
    .meta(
      openApiMeta(
        "documents",
        "POST",
        "/document-versions/by-id/{versionId}/duplicate",
        "Creates an independent copy of the version"
      )
    )
    .input(z.object({ versionId: z.uuid() }))
    .output(z.object({ versionId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      new DocumentsService(db).duplicate({ userId: ctx.userId, ...input })
    ),

  renameVersion: userProcedure
    .meta(
      openApiMeta(
        "documents",
        "PUT",
        "/document-versions/by-id/{versionId}/label",
        "Renames the version's tab"
      )
    )
    .input(z.object({ versionId: z.uuid(), label: z.string().max(60) }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new DocumentsService(db).renameVersion({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  deleteVersion: userProcedure
    .meta(
      openApiMeta(
        "documents",
        "DELETE",
        "/document-versions/by-id/{versionId}",
        "Deletes the version and all its snapshots"
      )
    )
    .input(z.object({ versionId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new DocumentsService(db).deleteVersion({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  requestPdf: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "documents",
        "POST",
        "/document-versions/by-id/{versionId}/pdf",
        "Renders the version's official snapshot as a PDF, unless it is ready"
      )
    )
    .input(z.object({ versionId: z.uuid() }))
    .output(z.object({ ready: z.boolean() }))
    .mutation(({ ctx, input }) =>
      new PdfService(db).request({ userId: ctx.userId, ...input })
    ),

  prepareApplicationZip: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "documents",
        "POST",
        "/openings/by-id/{openingId}/documents-zip",
        "Renders whatever the application's ZIP still lacks"
      )
    )
    .input(z.object({ openingId: z.uuid() }))
    .output(z.object({ ready: z.boolean() }))
    .mutation(({ ctx, input }) =>
      new PdfService(db).prepareApplication({ userId: ctx.userId, ...input })
    ),
});
