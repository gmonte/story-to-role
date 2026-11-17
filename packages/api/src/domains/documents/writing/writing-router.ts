import { z } from "zod";

import { realtimeSubscriptionSchema } from "@repo/api/domains/tasks/schemas/task";
import { db } from "@repo/api/tools/db";
import { ok, okSchema, openApiMeta } from "@repo/api/tools/openapi";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
} from "@repo/api/tools/trpc";

import { generationSettingsSchema } from "../schemas/generation-settings";
import {
  resumeHeaderFieldsSchema,
  styleProfileSchema,
  templateSectionSchema,
} from "../schemas/template";
import { WritingService } from "./writing-service";

export const writingRouter = createTRPCRouter({
  get: userProcedure
    .meta(
      openApiMeta(
        "writing",
        "GET",
        "/writing",
        "Returns the global template, resume header and style profile"
      )
    )
    .input(z.object({}))
    .output(
      z.object({
        templateSections: z.array(templateSectionSchema),
        header: resumeHeaderFieldsSchema,
        generationSettings: generationSettingsSchema,
        style: styleProfileSchema.nullable(),
        styleDraft: styleProfileSchema.nullable(),
        styleStatus: z.enum(["none", "extracting", "draft", "approved"]),
      })
    )
    .query(({ ctx }) => new WritingService(db).get(ctx.userId)),

  updateTemplate: userProcedure
    .meta(
      openApiMeta(
        "writing",
        "PUT",
        "/writing/template",
        "Saves the global template"
      )
    )
    .input(
      z.object({
        sections: z.array(templateSectionSchema).max(20),
      })
    )
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new WritingService(db).updateTemplate({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  updateGenerationSettings: userProcedure
    .meta(
      openApiMeta(
        "writing",
        "PUT",
        "/writing/generation-settings",
        "Saves the user's generation settings, the defaults of every document"
      )
    )
    .input(z.object({ settings: generationSettingsSchema }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new WritingService(db).updateGenerationSettings({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  extractStyle: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "writing",
        "POST",
        "/writing/style",
        "Extracts a style profile from up to three writing samples"
      )
    )
    .input(
      z.object({
        samples: z.array(z.string().max(20_000)).max(3),
      })
    )
    .output(z.object({ realtime: realtimeSubscriptionSchema }))
    .mutation(({ ctx, input }) =>
      new WritingService(db).extractStyle({ userId: ctx.userId, ...input })
    ),

  approveStyle: userProcedure
    .meta(
      openApiMeta(
        "writing",
        "PUT",
        "/writing/style",
        "Approves the reviewed style profile"
      )
    )
    .input(z.object({ style: styleProfileSchema }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new WritingService(db).approveStyle({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),
});
