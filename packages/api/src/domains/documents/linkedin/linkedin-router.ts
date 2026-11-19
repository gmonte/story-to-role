import { z } from "zod";

import { toneSchema } from "@repo/api/domains/openings/schemas/opening";
import { realtimeSubscriptionSchema } from "@repo/api/domains/tasks/schemas/task";
import { db } from "@repo/api/tools/db";
import { openApiMeta } from "@repo/api/tools/openapi";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
} from "@repo/api/tools/trpc";

import { outputLanguageSchema, writingLevelSchema } from "../schemas/document";
import { generationSettingsFields } from "../schemas/generation-settings";
import { LinkedinService } from "./linkedin-service";

export const linkedinRouter = createTRPCRouter({
  generate: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "linkedin",
        "POST",
        "/linkedin",
        "Generates the LinkedIn text from the published profile, or again in a language"
      )
    )
    .input(
      z.object({
        language: outputLanguageSchema,
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
      new LinkedinService(db).generate({ userId: ctx.userId, ...input })
    ),

  sectionText: userProcedure
    .meta(
      openApiMeta(
        "linkedin",
        "GET",
        "/linkedin/versions/by-id/{versionId}/text",
        "Returns one section's text to copy, refused while the text has coverage findings"
      )
    )
    .input(
      z.object({
        versionId: z.uuid(),
        // `headline`, `about`, `certifications`, `languages`, or the id of
        // the position, project or education whose text to copy.
        section: z.string().min(1).max(64),
        acknowledgeWarnings: z.boolean().optional(),
      })
    )
    .output(z.object({ text: z.string() }))
    .query(({ ctx, input }) =>
      new LinkedinService(db).sectionText({ userId: ctx.userId, ...input })
    ),
});
