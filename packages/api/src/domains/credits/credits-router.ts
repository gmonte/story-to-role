import { z } from "zod";

import { db } from "@repo/api/tools/db";
import { ok, okSchema, openApiMeta } from "@repo/api/tools/openapi";
import {
  adminProcedure,
  createTRPCRouter,
  isAdmin,
  userProcedure,
} from "@repo/api/tools/trpc";

import { CreditsService } from "./credits-service";
import { courtesyGrantSchema, creditSummarySchema } from "./schemas/credits";

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

  // Whether to show the admin page's link.
  isAdmin: userProcedure
    .input(z.object({}))
    .output(z.boolean())
    .query(({ ctx }) => isAdmin(ctx.session.userId)),
});
