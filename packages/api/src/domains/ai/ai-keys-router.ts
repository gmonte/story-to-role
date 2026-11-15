import { z } from "zod";

import { db } from "@repo/api/tools/db";
import { ok, okSchema, openApiMeta } from "@repo/api/tools/openapi";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
} from "@repo/api/tools/trpc";

import { AiKeysService } from "./ai-keys-service";
import { aiKeyViewSchema } from "./schemas/ai-keys";

export const aiKeysRouter = createTRPCRouter({
  get: userProcedure
    .meta(
      openApiMeta(
        "ai-keys",
        "GET",
        "/ai-keys",
        "Returns the user's own provider key (its last characters only)"
      )
    )
    .input(z.object({}))
    .output(aiKeyViewSchema.nullable())
    .query(({ ctx }) => new AiKeysService(db).get(ctx.userId)),

  save: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "ai-keys",
        "PUT",
        "/ai-keys",
        "Validates and saves the user's own provider key"
      )
    )
    .input(z.object({ apiKey: z.string().trim().min(20).max(300) }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new AiKeysService(db).save({
        userId: ctx.userId,
        apiKey: input.apiKey,
      });
      return ok;
    }),

  recheck: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "ai-keys",
        "POST",
        "/ai-keys/recheck",
        "Checks the saved key again after it ran out of credit or was refused"
      )
    )
    .input(z.object({}))
    .output(okSchema)
    .mutation(async ({ ctx }) => {
      await new AiKeysService(db).recheck(ctx.userId);
      return ok;
    }),

  remove: userProcedure
    .meta(
      openApiMeta(
        "ai-keys",
        "DELETE",
        "/ai-keys",
        "Deletes the user's own provider key"
      )
    )
    .input(z.object({}))
    .output(okSchema)
    .mutation(async ({ ctx }) => {
      await new AiKeysService(db).remove(ctx.userId);
      return ok;
    }),
});
