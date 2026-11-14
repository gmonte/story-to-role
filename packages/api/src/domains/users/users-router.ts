import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { userSchema } from "@repo/api/domains/users/schemas/user";
import { db } from "@repo/api/tools/db";
import { createTRPCRouter, protectedProcedure } from "@repo/api/tools/trpc";

export const usersRouter = createTRPCRouter({
  me: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/users/me",
        tags: ["users"],
        summary: "Returns the current authenticated user",
        protect: true,
      },
    })
    .input(z.void())
    .output(userSchema)
    .query(async ({ ctx }) => {
      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.clerkUserId, ctx.session.userId),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: ctx.t.formatMessage({ defaultMessage: "User not found" }),
        });
      }

      return user;
    }),
});
