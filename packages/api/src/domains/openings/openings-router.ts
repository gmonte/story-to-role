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
import { conditionStanceSchema, openingKindSchema } from "./schemas/opening";
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

  register: userProcedure
    .meta(
      openApiMeta(
        "openings",
        "POST",
        "/openings/registered",
        "Registers an opening without analysis: no credits are spent"
      )
    )
    .input(
      z.object({
        kind: openingKindSchema,
        company: z.string().trim().min(1).max(200),
        title: z.string().trim().max(200).optional(),
        description: z
          .string()
          .max(openingLimits.maxDescriptionCharacters)
          .optional(),
        link: z
          .url({ protocol: /^https?$/ })
          .max(2000)
          .optional(),
        notes: z
          .string()
          .trim()
          .max(openingLimits.maxNotesCharacters)
          .optional(),
      })
    )
    .output(z.object({ openingId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      new OpeningsService(db).register({ userId: ctx.userId, ...input })
    ),

  analyze: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "openings",
        "POST",
        "/openings/by-id/{openingId}/analyze",
        "Analyzes an opening registered without analysis"
      )
    )
    .input(z.object({ openingId: z.uuid() }))
    .output(z.object({ realtime: realtimeSubscriptionSchema }))
    .mutation(async ({ ctx, input }) => {
      const { realtime } = await new OpeningsService(db).analyze({
        userId: ctx.userId,
        ...input,
      });
      return { realtime };
    }),

  retryAnalysis: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "openings",
        "POST",
        "/openings/by-id/{openingId}/retry",
        "Analyzes again an opening whose analysis failed"
      )
    )
    .input(z.object({ openingId: z.uuid() }))
    .output(z.object({ realtime: realtimeSubscriptionSchema }))
    .mutation(async ({ ctx, input }) => {
      const { realtime } = await new OpeningsService(db).retryAnalysis({
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

  deleteOpening: userProcedure
    .meta(
      openApiMeta(
        "openings",
        "DELETE",
        "/openings/by-id/{openingId}",
        "Deletes an opening with its application and documents"
      )
    )
    .input(z.object({ openingId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new OpeningsService(db).deleteOpening({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  rename: userProcedure
    .meta(
      openApiMeta(
        "openings",
        "PUT",
        "/openings/by-id/{openingId}",
        "Edits an opening's title, company and link"
      )
    )
    .input(
      z.object({
        openingId: z.uuid(),
        title: z.string().trim().min(1).max(200),
        company: z.string().trim().max(200).optional(),
        // The posting's address; null removes it, absent leaves it.
        sourceUrl: z
          .url({ protocol: /^https?$/ })
          .max(2000)
          .nullable()
          .optional(),
      })
    )
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new OpeningsService(db).rename({ userId: ctx.userId, ...input });
      return ok;
    }),

  updateDescription: userProcedure
    .meta(
      openApiMeta(
        "openings",
        "PUT",
        "/openings/by-id/{openingId}/description",
        "Edits an opening's description; its fit check then reads as outdated"
      )
    )
    .input(
      z.object({
        openingId: z.uuid(),
        description: z.string().max(openingLimits.maxDescriptionCharacters),
      })
    )
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new OpeningsService(db).updateDescription({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  answerGapQuestion: userProcedure
    .meta(
      openApiMeta(
        "openings",
        "PUT",
        "/fit-check-items/by-id/{fitCheckItemId}/answer",
        "Answers a gap question with a story tied to positions or projects, or confirms the user lacks it"
      )
    )
    .input(
      z.object({
        fitCheckItemId: z.uuid(),
        // “I have it”: the story (an instruction for the application),
        // plus where it happened. “I don't have it” (`lacks`): the answer
        // is optional and no position is involved.
        answer: z.string().trim().min(1).max(4000).optional(),
        lacks: z.boolean().default(false),
        positionIds: z.array(z.uuid()).max(50).default([]),
        projectIds: z.array(z.uuid()).max(50).default([]),
        // A general story, tied to no position or project.
        notTied: z.boolean().default(false),
      })
    )
    .output(z.object({ profileSuggestionIds: z.array(z.uuid()) }))
    .mutation(({ ctx, input }) =>
      new OpeningsService(db).answerGapQuestion({
        userId: ctx.userId,
        ...input,
      })
    ),

  undoConditionAnswer: userProcedure
    .meta(
      openApiMeta(
        "openings",
        "DELETE",
        "/fit-check-items/by-id/{fitCheckItemId}/condition",
        "Takes back the answer to a condition requirement"
      )
    )
    .input(z.object({ fitCheckItemId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new OpeningsService(db).undoConditionAnswer({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  answerCondition: userProcedure
    .meta(
      openApiMeta(
        "openings",
        "PUT",
        "/fit-check-items/by-id/{fitCheckItemId}/condition",
        "Answers a condition requirement: the user meets it, doesn't but it is not a blocker, or it is a blocker"
      )
    )
    .input(
      z.object({
        fitCheckItemId: z.uuid(),
        stance: conditionStanceSchema,
        note: z.string().trim().max(1000).optional(),
        // For a blocker: add it to the job preferences as a discard rule.
        addToPreferences: z.boolean().default(false),
      })
    )
    .output(z.object({ preferenceRule: z.string().nullable() }))
    .mutation(({ ctx, input }) =>
      new OpeningsService(db).answerCondition({
        userId: ctx.userId,
        ...input,
        language: templateLanguage(ctx),
      })
    ),
});
