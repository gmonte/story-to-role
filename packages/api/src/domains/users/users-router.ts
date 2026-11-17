import { z } from "zod";

import { userSchema } from "@repo/api/domains/users/schemas/user";
import { UsersRepository } from "@repo/api/domains/users/users-repository";
import { db } from "@repo/api/tools/db";
import {
  createTRPCRouter,
  protectedProcedure,
  userProcedure,
} from "@repo/api/tools/trpc";

export const usersRouter = createTRPCRouter({
  me: userProcedure
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
    .query(({ ctx }) => ctx.user),

  /**
   * Whether the Clerk webhook has created the local user yet: a fresh
   * sign-up reaches the workspace a moment before it does.
   */
  accountReady: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/users/account-ready",
        tags: ["users"],
        summary: "Whether the signed-in user's account is ready",
        protect: true,
      },
    })
    .input(z.object({}))
    .output(z.object({ ready: z.boolean() }))
    .query(async ({ ctx }) => ({
      ready: Boolean(
        await new UsersRepository(db).findActiveByClerkUserId(
          ctx.session.userId
        )
      ),
    })),
});
