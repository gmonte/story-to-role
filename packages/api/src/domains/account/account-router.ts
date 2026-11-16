import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { db } from "@repo/api/tools/db";
import { ok, okSchema, openApiMeta } from "@repo/api/tools/openapi";
import { createTRPCRouter, userProcedure } from "@repo/api/tools/trpc";

import { AccountService } from "./account-service";

export const accountRouter = createTRPCRouter({
  delete: userProcedure
    .meta(
      openApiMeta(
        "account",
        "DELETE",
        "/account",
        "Deletes the account and everything in it, at once and for good"
      )
    )
    // The user types their email to confirm.
    .input(z.object({ confirmEmail: z.string() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      if (
        input.confirmEmail.trim().toLowerCase() !== ctx.user.email.toLowerCase()
      ) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      await new AccountService(db).deleteAccount({
        userId: ctx.userId,
        clerkUserId: ctx.session.userId,
      });
      return ok;
    }),
});
