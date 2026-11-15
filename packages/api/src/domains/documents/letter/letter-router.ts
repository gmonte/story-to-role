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

import { outputLanguageSchema, writingLevelSchema } from "../schemas/document";
import { LetterService } from "./letter-service";

const started = z.object({
  generationId: z.uuid(),
  realtime: realtimeSubscriptionSchema,
});

export const letterRouter = createTRPCRouter({
  generate: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "letters",
        "POST",
        "/openings/by-id/{openingId}/cover-letter",
        "Generates a cover letter, with or without a resume version"
      )
    )
    .input(
      z.object({
        openingId: z.uuid(),
        language: outputLanguageSchema,
        tone: toneSchema,
        writingLevel: writingLevelSchema,
        resumeVersionId: z.uuid().nullable(),
        versionId: z.uuid().optional(),
      })
    )
    .output(started)
    .mutation(({ ctx, input }) =>
      new LetterService(db).generate({ userId: ctx.userId, ...input })
    ),

  update: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "letters",
        "POST",
        "/document-versions/by-id/{versionId}/letter-update",
        "Adjusts the letter to what changed in its resume, as a proposal"
      )
    )
    .input(z.object({ versionId: z.uuid() }))
    .output(started)
    .mutation(({ ctx, input }) =>
      new LetterService(db).update({ userId: ctx.userId, ...input })
    ),

  dismissOutdated: userProcedure
    .meta(
      openApiMeta(
        "letters",
        "POST",
        "/document-versions/by-id/{versionId}/letter-outdated/dismiss",
        "Keeps the letter as it is despite the resume's changes"
      )
    )
    .input(z.object({ versionId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new LetterService(db).dismissOutdated({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),
});
