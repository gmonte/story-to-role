import { z } from "zod";

import { db } from "@repo/api/tools/db";
import { ok, okSchema, openApiMeta } from "@repo/api/tools/openapi";
import { createTRPCRouter, userProcedure } from "@repo/api/tools/trpc";

import { AccountService } from "./account-service";

export const accountRouter = createTRPCRouter({
  // A POST: the confirming email goes in the body, never in a logged URL.
  delete: userProcedure
    .meta(
      openApiMeta(
        "account",
        "POST",
        "/account/delete",
        "Deletes the account and everything in it, at once and for good"
      )
    )
    .input(z.object({ confirmEmail: z.string().max(320) }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new AccountService(db).deleteAccount({
        userId: ctx.userId,
        clerkUserId: ctx.session.userId,
        email: ctx.user.email,
        confirmEmail: input.confirmEmail,
      });
      return ok;
    }),
});
