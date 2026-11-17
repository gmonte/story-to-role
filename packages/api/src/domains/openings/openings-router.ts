import { z } from "zod";

import { templateLanguage } from "@repo/api/domains/profile/template-language";
import { realtimeSubscriptionSchema } from "@repo/api/domains/tasks/schemas/task";
import { db } from "@repo/api/tools/db";
import { ok, okSchema, openApiMeta } from "@repo/api/tools/openapi";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
} from "@repo/api/tools/trpc";

import { openingLimits, OpeningsService } from "./openings-service";
import {
  openingDetailSchema,
  openingSummarySchema,
} from "./schemas/opening-view";

const started = z.object({
  openingId: z.uuid(),
  realtime: realtimeSubscriptionSchema,
});

export const openingsRouter = createTRPCRouter({
  list: userProcedure
    .meta(
      openApiMeta("openings", "GET", "/openings", "Lists the user's openings")
    )
    .input(z.object({}))
    .output(z.array(openingSummarySchema))
    .query(({ ctx }) => new OpeningsService(db).list(ctx.userId)),

  byId: userProcedure
    .meta(
      openApiMeta(
        "openings",
        "GET",
        "/openings/by-id/{openingId}",
        "Returns an opening with its fit check"
      )
    )
    .input(z.object({ openingId: z.uuid() }))
    .output(openingDetailSchema)
    .query(({ ctx, input }) =>
      new OpeningsService(db).get({ userId: ctx.userId, ...input })
    ),

  addFromText: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "openings",
        "POST",
        "/openings/from-text",
        "Adds an opening by pasting its description"
      )
    )
    .input(
      z.object({
        description: z
          .string()
          .min(openingLimits.minDescriptionCharacters)
          .max(openingLimits.maxDescriptionCharacters),
      })
    )
    .output(started)
    .mutation(({ ctx, input }) =>
      new OpeningsService(db).createFromText({ userId: ctx.userId, ...input })
    ),

  addFromLink: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "openings",
        "POST",
        "/openings/from-link",
        "Adds an opening from its link"
      )
    )
    .input(z.object({ url: z.url({ protocol: /^https?$/ }).max(2000) }))
    .output(started)
    .mutation(({ ctx, input }) =>
      new OpeningsService(db).createFromLink({ userId: ctx.userId, ...input })
    ),

  addUnsolicited: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "openings",
        "POST",
        "/openings/unsolicited",
        "Adds a company to approach with no vacancy open"
      )
    )
    .input(
      z.object({
        company: z.string().trim().min(1).max(200),
        role: z.string().trim().max(200).optional(),
        notes: z
          .string()
          .trim()
          .max(openingLimits.maxNotesCharacters)
          .optional(),
        link: z
          .url({ protocol: /^https?$/ })
          .max(2000)
          .optional(),
      })
    )
    .output(started)
    .mutation(({ ctx, input }) =>
      new OpeningsService(db).createUnsolicited({
        userId: ctx.userId,
        ...input,
      })
    ),

  analyzeExternal: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "openings",
        "POST",
        "/openings/by-id/{openingId}/analyze",
        "Analyzes an opening registered with an external application"
      )
    )
    .input(z.object({ openingId: z.uuid() }))
    .output(z.object({ realtime: realtimeSubscriptionSchema }))
    .mutation(async ({ ctx, input }) => {
      const { realtime } = await new OpeningsService(db).analyzeExternal({
        userId: ctx.userId,
        ...input,
      });
      return { realtime };
    }),

  reanalyze: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "openings",
        "POST",
        "/openings/by-id/{openingId}/fit-check",
        "Runs the fit check again on the published profile"
      )
    )
    .input(z.object({ openingId: z.uuid() }))
    .output(z.object({ realtime: realtimeSubscriptionSchema }))
    .mutation(async ({ ctx, input }) => {
      const { realtime } = await new OpeningsService(db).reanalyze({
        userId: ctx.userId,
        ...input,
      });
      return { realtime };
    }),

  excludeCompany: userProcedure
    .meta(
      openApiMeta(
        "openings",
        "POST",
        "/openings/by-id/{openingId}/exclude-company",
        "Adds the opening's company to the excluded companies of the job preferences"
      )
    )
    .input(
      z.object({
        openingId: z.uuid(),
        // The user's own day, written next to the company.
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .output(z.object({ company: z.string() }))
    .mutation(({ ctx, input }) =>
      new OpeningsService(db).excludeCompany({
        userId: ctx.userId,
        language: templateLanguage(ctx),
        ...input,
      })
    ),

  setClosed: userProcedure
    .meta(
      openApiMeta(
        "openings",
        "PUT",
        "/openings/by-id/{openingId}/closed",
        "Closes or reopens an opening"
      )
    )
    .input(z.object({ openingId: z.uuid(), closed: z.boolean() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new OpeningsService(db).setClosed({ userId: ctx.userId, ...input });
      return ok;
    }),

  rename: userProcedure
    .meta(
      openApiMeta(
        "openings",
        "PUT",
        "/openings/by-id/{openingId}",
        "Edits an opening's title and company"
      )
    )
    .input(
      z.object({
        openingId: z.uuid(),
        title: z.string().trim().min(1).max(200),
        company: z.string().trim().max(200).optional(),
      })
    )
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new OpeningsService(db).rename({ userId: ctx.userId, ...input });
      return ok;
    }),

  answerGapQuestion: userProcedure
    .meta(
      openApiMeta(
        "openings",
        "PUT",
        "/fit-check-items/by-id/{fitCheckItemId}/answer",
        "Answers a gap question"
      )
    )
    .input(
      z.object({
        fitCheckItemId: z.uuid(),
        answer: z.string().trim().min(1).max(4000),
      })
    )
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new OpeningsService(db).answerGapQuestion({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),
});
