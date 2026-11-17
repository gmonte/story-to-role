import { z } from "zod";

import { db } from "@repo/api/tools/db";
import { ok, okSchema, openApiMeta } from "@repo/api/tools/openapi";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
  type TRPCContext,
} from "@repo/api/tools/trpc";
import { ImportService } from "@repo/api/domains/profile/import/import-service";
import { realtimeSubscriptionSchema } from "@repo/api/domains/tasks/schemas/task";

import { CareerService } from "./career-service";
import { DocumentsService } from "./documents/documents-service";
import {
  interviewLanguageSchema,
  startPathSchema,
  type InterviewLanguage,
} from "./schemas/career";
import { documentPreviewSchema, timelineSchema } from "./schemas/timeline";

/** New profiles start in the interface language. */
function defaultLanguage(ctx: Pick<TRPCContext, "t">): InterviewLanguage {
  return ctx.t.locale === "pt-BR" ? "pt-BR" : "en-US";
}

export const careerRouter = createTRPCRouter({
  timeline: userProcedure
    .meta(
      openApiMeta(
        "career",
        "GET",
        "/career/timeline",
        "Returns the user's career timeline"
      )
    )
    .input(z.object({}))
    .output(timelineSchema)
    .query(({ ctx }) =>
      new CareerService(db).getTimeline({
        userId: ctx.userId,
        defaultLanguage: defaultLanguage(ctx),
      })
    ),

  updateSettings: userProcedure
    .meta(
      openApiMeta(
        "career",
        "PUT",
        "/career/settings",
        "Sets the career language"
      )
    )
    .input(z.object({ interviewLanguage: interviewLanguageSchema }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).updateSettings({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  startState: userProcedure
    .meta(
      openApiMeta(
        "career",
        "GET",
        "/career/start",
        "Returns how the user chose to start and whether they have started"
      )
    )
    .input(z.object({}))
    .output(
      z.object({
        path: startPathSchema.nullable(),
        hasStarted: z.boolean(),
        hasOpening: z.boolean(),
      })
    )
    .query(({ ctx }) => new CareerService(db).startState(ctx.userId)),

  chooseStart: userProcedure
    .meta(
      openApiMeta(
        "career",
        "POST",
        "/career/start",
        "Records how the user chose to start"
      )
    )
    .input(z.object({ path: startPathSchema }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).chooseStart({
        userId: ctx.userId,
        defaultLanguage: defaultLanguage(ctx),
        path: input.path,
      });
      return ok;
    }),

  acceptPrivacyNotice: userProcedure
    .meta(
      openApiMeta(
        "career",
        "POST",
        "/career/privacy-notice",
        "Records that the user read the privacy notice"
      )
    )
    .input(z.object({}))
    .output(okSchema)
    .mutation(async ({ ctx }) => {
      await new CareerService(db).acceptPrivacyNotice(ctx.userId);
      return ok;
    }),

  removeDocument: userProcedure
    .meta(
      openApiMeta(
        "career",
        "DELETE",
        "/career/documents/by-id/{sourceDocumentId}",
        "Removes a source and its file"
      )
    )
    .input(z.object({ sourceDocumentId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new DocumentsService(db).remove({ userId: ctx.userId, ...input });
      return ok;
    }),

  importDocument: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "career",
        "POST",
        "/career/documents/by-id/{sourceDocumentId}/import",
        "Reads a source into suggestions for the profile"
      )
    )
    .input(z.object({ sourceDocumentId: z.uuid() }))
    .output(z.object({ realtime: realtimeSubscriptionSchema }))
    .mutation(({ ctx, input }) =>
      new ImportService(db).start({ userId: ctx.userId, ...input })
    ),

  documentPreview: userProcedure
    .meta(
      openApiMeta(
        "career",
        "GET",
        "/career/documents/by-id/{sourceDocumentId}/preview",
        "A source's read-only preview: plain text, or a PDF's page count"
      )
    )
    .input(z.object({ sourceDocumentId: z.uuid() }))
    .output(documentPreviewSchema)
    .query(({ ctx, input }) =>
      new DocumentsService(db).preview({ userId: ctx.userId, ...input })
    ),
});
