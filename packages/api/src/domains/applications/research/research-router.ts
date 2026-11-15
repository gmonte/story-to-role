import { z } from "zod";

import { realtimeSubscriptionSchema } from "@repo/api/domains/tasks/schemas/task";
import { db } from "@repo/api/tools/db";
import { ok, okSchema, openApiMeta } from "@repo/api/tools/openapi";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
} from "@repo/api/tools/trpc";

import { companyResearchSchema } from "../schemas/research";
import { ResearchService } from "./research-service";

export const researchRouter = createTRPCRouter({
  get: userProcedure
    .meta(
      openApiMeta(
        "research",
        "GET",
        "/openings/by-id/{openingId}/company-research",
        "Returns the company research and its facts"
      )
    )
    .input(z.object({ openingId: z.uuid() }))
    .output(companyResearchSchema)
    .query(({ ctx, input }) =>
      new ResearchService(db).get({ userId: ctx.userId, ...input })
    ),

  start: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "research",
        "POST",
        "/openings/by-id/{openingId}/company-research",
        "Researches the company on the web, within a limit of searches"
      )
    )
    .input(z.object({ openingId: z.uuid() }))
    .output(z.object({ realtime: realtimeSubscriptionSchema }))
    .mutation(({ ctx, input }) =>
      new ResearchService(db).start({ userId: ctx.userId, ...input })
    ),

  select: userProcedure
    .meta(
      openApiMeta(
        "research",
        "PUT",
        "/openings/by-id/{openingId}/company-facts",
        "Selects the company facts a cover letter may use"
      )
    )
    .input(z.object({ openingId: z.uuid(), companyFactIds: z.array(z.uuid()) }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new ResearchService(db).select({ userId: ctx.userId, ...input });
      return ok;
    }),
});
