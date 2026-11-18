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

import { generationSettingsFields } from "../schemas/generation-settings";
import { DocumentsService } from "../documents-service";
import {
  outputLanguageSchema,
  reviewDepthSchema,
  writingLevelSchema,
} from "../schemas/document";
import { documentViewSchema } from "../schemas/document-view";
import {
  libraryDocumentSchema,
  similarDocumentSchema,
} from "../schemas/library";
import { LibraryService } from "./library-service";

export const libraryRouter = createTRPCRouter({
  list: userProcedure
    .meta(
      openApiMeta(
        "library",
        "GET",
        "/library/documents",
        "Lists the library documents, each titled by its focus"
      )
    )
    .input(z.object({}))
    .output(z.array(libraryDocumentSchema))
    .query(({ ctx }) => new LibraryService(db).list({ userId: ctx.userId })),

  document: userProcedure
    .meta(
      openApiMeta(
        "library",
        "GET",
        "/library/documents/by-id/{documentId}",
        "Returns a library document with its versions"
      )
    )
    .input(z.object({ documentId: z.uuid() }))
    .output(documentViewSchema)
    .query(({ ctx, input }) =>
      new DocumentsService(db).libraryDocument({ userId: ctx.userId, ...input })
    ),

  deleteDocument: userProcedure
    .meta(
      openApiMeta(
        "library",
        "DELETE",
        "/library/documents/by-id/{documentId}",
        "Deletes a library document with its versions, history and PDFs"
      )
    )
    .input(z.object({ documentId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new DocumentsService(db).deleteDocument({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  generateResume: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "library",
        "POST",
        "/library/resumes",
        "Generates a library resume for a focus, or again into a version"
      )
    )
    .input(
      z.object({
        focus: z.string().trim().min(1).max(80).optional(),
        versionId: z.uuid().optional(),
        documentId: z.uuid().optional(),
        language: outputLanguageSchema,
        reviewDepth: reviewDepthSchema,
        writingLevel: writingLevelSchema,
        tone: toneSchema,
        settings: generationSettingsFields.partial().optional(),
      })
    )
    .output(
      z.object({
        documentId: z.uuid(),
        generationId: z.uuid(),
        realtime: realtimeSubscriptionSchema,
      })
    )
    .mutation(({ ctx, input }) =>
      new LibraryService(db).generateResume({ userId: ctx.userId, ...input })
    ),

  similarForOpening: userProcedure
    .meta(
      openApiMeta(
        "library",
        "GET",
        "/openings/by-id/{openingId}/similar-documents",
        "Suggests the user's documents closest to the opening"
      )
    )
    .input(z.object({ openingId: z.uuid() }))
    .output(z.array(similarDocumentSchema))
    .query(({ ctx, input }) =>
      new LibraryService(db).similarForOpening({
        userId: ctx.userId,
        ...input,
      })
    ),

  copyIntoApplication: userProcedure
    .meta(
      openApiMeta(
        "library",
        "POST",
        "/openings/by-id/{openingId}/copies",
        "Uses a similar document as is, adapting it when in another language"
      )
    )
    .input(
      z.object({
        openingId: z.uuid(),
        versionId: z.uuid(),
        // The opening's output language: another one means an adaptation.
        language: outputLanguageSchema,
      })
    )
    .output(
      z.object({
        versionId: z.uuid().nullable(),
        generationId: z.uuid().nullable(),
        realtime: realtimeSubscriptionSchema.nullable(),
      })
    )
    .mutation(({ ctx, input }) =>
      new LibraryService(db).copyIntoApplication({
        userId: ctx.userId,
        ...input,
      })
    ),
});
