import { z } from "zod";

import { env } from "@repo/common/env/web.env";
import { db } from "@repo/api/tools/db";
import { ok, okSchema, openApiMeta } from "@repo/api/tools/openapi";
import {
  adminProcedure,
  createTRPCRouter,
  isAdmin,
  userProcedure,
} from "@repo/api/tools/trpc";
import { paginationParamsSchema } from "@repo/api/utils/schemas/pagination";

import { CreditsService } from "./credits-service";
import { courtesyGrantSchema, creditSummarySchema } from "./schemas/credits";
import {
  platformUsageSchema,
  usageOperationsSchema,
  usageStatementSchema,
} from "./schemas/usage-statement";

export const creditsRouter = createTRPCRouter({
  summary: userProcedure
    .meta(
      openApiMeta(
        "credits",
        "GET",
        "/credits",
        "Returns the credit meter: balance by source and expiry, reserve and estimates"
      )
    )
    .input(z.object({}))
    .output(creditSummarySchema)
    .query(({ ctx }) => new CreditsService(db).summary(ctx.userId)),

  usageStatement: userProcedure
    .meta(
      openApiMeta(
        "credits",
        "GET",
        "/credits/usage",
        "Returns the usage statement's totals by payer and averages per kind of AI operation in a window"
      )
    )
    .input(
      z.object({
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      })
    )
    .output(usageStatementSchema)
    .query(({ ctx, input }) =>
      new CreditsService(db).usageStatement(ctx.userId, {
        ...input,
        showsPlatformCost: env.USAGE_STATEMENT_SHOWS_PLATFORM_COST,
      })
    ),

  usageOperations: userProcedure
    .meta(
      openApiMeta(
        "credits",
        "GET",
        "/credits/usage/operations",
        "Returns a page of the usage statement's AI operations: who paid, tokens and credits, by model"
      )
    )
    .input(
      paginationParamsSchema.extend({
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      })
    )
    .output(usageOperationsSchema)
    .query(({ ctx, input }) =>
      new CreditsService(db).usageOperations(ctx.userId, {
        ...input,
        showsPlatformCost: env.USAGE_STATEMENT_SHOWS_PLATFORM_COST,
      })
    ),

  platformUsage: adminProcedure
    .meta(
      openApiMeta(
        "credits",
        "GET",
        "/admin/usage",
        "Returns the usage statement over every user, with averages per operation and per model (admin only)"
      )
    )
    .input(
      z.object({
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      })
    )
    .output(platformUsageSchema)
    .query(({ input }) => new CreditsService(db).platformUsage(input)),

  listCourtesyGrants: adminProcedure
    .meta(
      openApiMeta(
        "credits",
        "GET",
        "/admin/courtesy-grants",
        "Lists every courtesy grant (admin only)"
      )
    )
    .input(z.object({}))
    .output(z.array(courtesyGrantSchema))
    .query(() => new CreditsService(db).listCourtesyGrants()),

  grantCourtesy: adminProcedure
    .meta(
      openApiMeta(
        "credits",
        "POST",
        "/admin/courtesy-grants",
        "Grants the paid plan to a user without a subscription (admin only)"
      )
    )
    .input(
      z.object({
        email: z.string().email(),
        monthlyCredits: z.number().int().min(0).max(100_000),
        endsAt: z.coerce.date().nullable(),
      })
    )
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new CreditsService(db).grantCourtesy({
        adminUserId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  endCourtesy: adminProcedure
    .meta(
      openApiMeta(
        "credits",
        "POST",
        "/admin/courtesy-grants/by-id/{courtesyGrantId}/end",
        "Ends a courtesy grant now (admin only)"
      )
    )
    .input(z.object({ courtesyGrantId: z.string().uuid() }))
    .output(okSchema)
    .mutation(async ({ input }) => {
      await new CreditsService(db).endCourtesy(input);
      return ok;
    }),

  confirmStoredCredits: userProcedure
    .meta(
      openApiMeta(
        "credits",
        "POST",
        "/credits/confirm-stored",
        "Finish with credits: agrees to spend stored credits this month"
      )
    )
    .input(z.object({}))
    .output(okSchema)
    .mutation(async ({ ctx }) => {
      await new CreditsService(db).confirmStoredCredits(ctx.userId);
      return ok;
    }),

  // Whether to show the admin page's link.
  isAdmin: userProcedure
    .input(z.object({}))
    .output(z.boolean())
    .query(({ ctx }) => isAdmin(ctx.session.userId)),
});
