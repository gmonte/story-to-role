import { z } from "zod";

import { userSchema } from "@repo/api/domains/users/schemas/user";
import { createTRPCRouter, userProcedure } from "@repo/api/tools/trpc";

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
});
