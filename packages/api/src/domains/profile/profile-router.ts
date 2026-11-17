import { z } from "zod";

import { db } from "@repo/api/tools/db";
import { openApiMeta } from "@repo/api/tools/openapi";
import {
  createTRPCRouter,
  userProcedure,
  type TRPCContext,
} from "@repo/api/tools/trpc";

import { ProfileService } from "./profile-service";
import {
  maxProfileLength,
  profileDraftSchema,
  profileFindingSchema,
  profileVersionSummarySchema,
} from "./schemas/profile";
import type { ProfileLanguage } from "./truth/sections";

/** A new profile starts from the template in the interface language. */
function templateLanguage(ctx: Pick<TRPCContext, "t">): ProfileLanguage {
  return ctx.t.locale === "pt-BR" ? "pt-BR" : "en-US";
}

const revisionSchema = z.number().int().min(0);

const savedDraftSchema = z.object({
  revision: z.number().int(),
  updatedAt: z.date(),
  findings: z.array(profileFindingSchema),
});

export const profileRouter = createTRPCRouter({
  draft: userProcedure
    .meta(
      openApiMeta(
        "profile",
        "GET",
        "/profile/draft",
        "Returns the profile's draft"
      )
    )
    .input(z.object({}))
    .output(profileDraftSchema)
    .query(({ ctx }) =>
      new ProfileService(db).getDraft({
        userId: ctx.userId,
        language: templateLanguage(ctx),
      })
    ),

  saveDraft: userProcedure
    .meta(
      openApiMeta(
        "profile",
        "PUT",
        "/profile/draft",
        "Saves the profile's draft"
      )
    )
    .input(
      z.object({
        markdown: z.string().max(maxProfileLength),
        baseRevision: revisionSchema,
      })
    )
    .output(savedDraftSchema)
    .mutation(({ ctx, input }) =>
      new ProfileService(db).saveDraft({ userId: ctx.userId, ...input })
    ),

  publish: userProcedure
    .meta(
      openApiMeta(
        "profile",
        "POST",
        "/profile/publish",
        "Publishes the draft as a new published version"
      )
    )
    .input(z.object({ baseRevision: revisionSchema }))
    .output(z.object({ versionId: z.uuid(), number: z.number().int() }))
    .mutation(({ ctx, input }) =>
      new ProfileService(db).publish({ userId: ctx.userId, ...input })
    ),

  versions: userProcedure
    .meta(
      openApiMeta(
        "profile",
        "GET",
        "/profile/versions",
        "Lists the published versions"
      )
    )
    .input(z.object({}))
    .output(z.array(profileVersionSummarySchema))
    .query(({ ctx }) => new ProfileService(db).listVersions(ctx.userId)),

  version: userProcedure
    .meta(
      openApiMeta(
        "profile",
        "GET",
        "/profile/versions/by-id/{profileVersionId}",
        "Returns a published version"
      )
    )
    .input(z.object({ profileVersionId: z.uuid() }))
    .output(profileVersionSummarySchema.extend({ markdown: z.string() }))
    .query(({ ctx, input }) =>
      new ProfileService(db).getVersion({ userId: ctx.userId, ...input })
    ),

  restoreVersion: userProcedure
    .meta(
      openApiMeta(
        "profile",
        "POST",
        "/profile/versions/by-id/{profileVersionId}/restore",
        "Copies a published version into the draft"
      )
    )
    .input(
      z.object({ profileVersionId: z.uuid(), baseRevision: revisionSchema })
    )
    .output(savedDraftSchema)
    .mutation(({ ctx, input }) =>
      new ProfileService(db).restoreVersion({ userId: ctx.userId, ...input })
    ),
});
