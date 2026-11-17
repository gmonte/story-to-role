import { z } from "zod";

import { db } from "@repo/api/tools/db";
import { openApiMeta } from "@repo/api/tools/openapi";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
} from "@repo/api/tools/trpc";
import { realtimeSubscriptionSchema } from "@repo/api/domains/tasks/schemas/task";

import { ProfileService } from "./profile-service";
import { profileValidationSchema } from "./schemas/validation";
import {
  maxProfileLength,
  profileDocumentKindSchema,
  profileDraftSchema,
  profileFindingSchema,
  profileSuggestionSchema,
  profileVersionSummarySchema,
} from "./schemas/profile";
import { templateLanguage } from "./template-language";

const revisionSchema = z.number().int().min(0);

// Which of the user's two documents: the profile unless said otherwise.
const kindSchema = profileDocumentKindSchema.default("profile");

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
    .input(z.object({ kind: kindSchema }))
    .output(profileDraftSchema)
    .query(({ ctx, input }) =>
      new ProfileService(db).getDraft({
        userId: ctx.userId,
        language: templateLanguage(ctx),
        kind: input.kind,
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
        kind: kindSchema,
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
    .input(z.object({ baseRevision: revisionSchema, kind: kindSchema }))
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
    .input(z.object({ kind: kindSchema }))
    .output(z.array(profileVersionSummarySchema))
    .query(({ ctx, input }) =>
      new ProfileService(db).listVersions(ctx.userId, input.kind)
    ),

  version: userProcedure
    .meta(
      openApiMeta(
        "profile",
        "GET",
        "/profile/versions/by-id/{profileVersionId}",
        "Returns a published version"
      )
    )
    .input(z.object({ profileVersionId: z.uuid(), kind: kindSchema }))
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
      z.object({
        profileVersionId: z.uuid(),
        baseRevision: revisionSchema,
        kind: kindSchema,
      })
    )
    .output(savedDraftSchema)
    .mutation(({ ctx, input }) =>
      new ProfileService(db).restoreVersion({ userId: ctx.userId, ...input })
    ),

  validationEstimate: userProcedure
    .meta(
      openApiMeta(
        "profile",
        "GET",
        "/profile/validation/estimate",
        "What Validate would review now, and its credit cap"
      )
    )
    .input(z.object({}))
    .output(z.object({ parts: z.array(z.string()), credits: z.number().int() }))
    .query(({ ctx }) => new ProfileService(db).validationEstimate(ctx.userId)),

  validate: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "profile",
        "POST",
        "/profile/validate",
        "Starts an AI quality review of what changed in the draft"
      )
    )
    .input(z.object({ baseRevision: revisionSchema }))
    .output(
      z.object({
        profileValidationId: z.uuid(),
        realtime: realtimeSubscriptionSchema,
      })
    )
    .mutation(({ ctx, input }) =>
      new ProfileService(db).validate({ userId: ctx.userId, ...input })
    ),

  latestValidation: userProcedure
    .meta(
      openApiMeta(
        "profile",
        "GET",
        "/profile/validation",
        "Returns the last validation, its progress and its report"
      )
    )
    .input(z.object({}))
    .output(profileValidationSchema.nullable())
    .query(({ ctx }) => new ProfileService(db).latestValidation(ctx.userId)),

  suggestions: userProcedure
    .meta(
      openApiMeta(
        "profile",
        "GET",
        "/profile/suggestions",
        "Lists the suggestions waiting for the user"
      )
    )
    .input(z.object({}))
    .output(z.array(profileSuggestionSchema))
    .query(({ ctx }) => new ProfileService(db).listSuggestions(ctx.userId)),

  resolveSuggestions: userProcedure
    .meta(
      openApiMeta(
        "profile",
        "POST",
        "/profile/suggestions/resolve",
        "Accepts or rejects suggestions: the given ones, or all pending"
      )
    )
    .input(
      z.object({
        resolution: z.enum(["accepted", "rejected"]),
        profileSuggestionIds: z.array(z.uuid()).max(200).optional(),
      })
    )
    .output(z.object({ resolved: z.number().int() }))
    .mutation(({ ctx, input }) =>
      new ProfileService(db).resolveSuggestions({
        userId: ctx.userId,
        ...input,
      })
    ),
});
