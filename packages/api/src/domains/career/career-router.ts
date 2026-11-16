import { z } from "zod";

import { realtimeSubscriptionSchema } from "@repo/api/domains/tasks/schemas/task";
import { db } from "@repo/api/tools/db";
import { ok, okSchema, openApiMeta } from "@repo/api/tools/openapi";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
  type TRPCContext,
} from "@repo/api/tools/trpc";

import { CareerService } from "./career-service";
import {
  interviewLanguageSchema,
  startPathSchema,
  type InterviewLanguage,
} from "./schemas/career";
import {
  credentialInputSchema,
  positionInputSchema,
  timelineSchema,
} from "./schemas/timeline";

/** New profiles start in the interface language. */
function defaultLanguage(ctx: Pick<TRPCContext, "t">): InterviewLanguage {
  return ctx.t.locale === "pt-BR" ? "pt-BR" : "en-US";
}

export const careerRouter = createTRPCRouter({
  timeline: userProcedure
    .meta(
      openApiMeta(
        "career",
        "GET",
        "/career/timeline",
        "Returns the user's career timeline"
      )
    )
    .input(z.object({}))
    .output(timelineSchema)
    .query(({ ctx }) =>
      new CareerService(db).getTimeline({
        userId: ctx.userId,
        defaultLanguage: defaultLanguage(ctx),
      })
    ),

  updateSettings: userProcedure
    .meta(
      openApiMeta(
        "career",
        "PUT",
        "/career/settings",
        "Sets the interview language"
      )
    )
    .input(z.object({ interviewLanguage: interviewLanguageSchema }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).updateSettings({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  startState: userProcedure
    .meta(
      openApiMeta(
        "career",
        "GET",
        "/career/start",
        "Returns how the user chose to start and whether they have started"
      )
    )
    .input(z.object({}))
    .output(
      z.object({
        path: startPathSchema.nullable(),
        hasStarted: z.boolean(),
        hasOpening: z.boolean(),
      })
    )
    .query(({ ctx }) => new CareerService(db).startState(ctx.userId)),

  chooseStart: userProcedure
    .meta(
      openApiMeta(
        "career",
        "POST",
        "/career/start",
        "Records how the user chose to start"
      )
    )
    .input(z.object({ path: startPathSchema }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).chooseStart({
        userId: ctx.userId,
        defaultLanguage: defaultLanguage(ctx),
        path: input.path,
      });
      return ok;
    }),

  acceptPrivacyNotice: userProcedure
    .meta(
      openApiMeta(
        "career",
        "POST",
        "/career/privacy-notice",
        "Records that the user read the privacy notice"
      )
    )
    .input(z.object({}))
    .output(okSchema)
    .mutation(async ({ ctx }) => {
      await new CareerService(db).acceptPrivacyNotice(ctx.userId);
      return ok;
    }),

  addPosition: userProcedure
    .meta(
      openApiMeta("career", "POST", "/positions", "Adds a position by hand")
    )
    .input(positionInputSchema)
    .output(z.object({ positionId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      new CareerService(db).addPosition({ userId: ctx.userId, position: input })
    ),

  updatePosition: userProcedure
    .meta(
      openApiMeta(
        "career",
        "PUT",
        "/positions/by-id/{positionId}",
        "Edits a position"
      )
    )
    .input(positionInputSchema.extend({ positionId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input: { positionId, ...position } }) => {
      await new CareerService(db).updatePosition({
        userId: ctx.userId,
        positionId,
        position,
      });
      return ok;
    }),

  removePosition: userProcedure
    .meta(
      openApiMeta(
        "career",
        "DELETE",
        "/positions/by-id/{positionId}",
        "Removes a position (it can be restored)"
      )
    )
    .input(z.object({ positionId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).removePosition({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  restorePosition: userProcedure
    .meta(
      openApiMeta(
        "career",
        "POST",
        "/positions/by-id/{positionId}/restore",
        "Restores a removed position with its evidence"
      )
    )
    .input(z.object({ positionId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).restorePosition({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  mergePositions: userProcedure
    .meta(
      openApiMeta(
        "career",
        "POST",
        "/positions/by-id/{positionId}/merge",
        "Merges a position into another"
      )
    )
    .input(z.object({ positionId: z.uuid(), intoPositionId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).mergePositions({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  resolveConflict: userProcedure
    .meta(
      openApiMeta(
        "career",
        "POST",
        "/position-conflicts/by-id/{positionConflictId}/resolve",
        "Picks one side of a conflict"
      )
    )
    .input(z.object({ positionConflictId: z.uuid(), value: z.string().min(1) }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).resolveConflict({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  addCredential: userProcedure
    .meta(
      openApiMeta("career", "POST", "/credentials", "Adds a credential by hand")
    )
    .input(credentialInputSchema)
    .output(z.object({ credentialId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      new CareerService(db).addCredential({
        userId: ctx.userId,
        credential: input,
      })
    ),

  updateCredential: userProcedure
    .meta(
      openApiMeta(
        "career",
        "PUT",
        "/credentials/by-id/{credentialId}",
        "Edits a credential"
      )
    )
    .input(credentialInputSchema.extend({ credentialId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input: { credentialId, ...credential } }) => {
      await new CareerService(db).updateCredential({
        userId: ctx.userId,
        credentialId,
        credential,
      });
      return ok;
    }),

  approveCredential: userProcedure
    .meta(
      openApiMeta(
        "career",
        "POST",
        "/credentials/by-id/{credentialId}/approve",
        "Approves an imported credential"
      )
    )
    .input(z.object({ credentialId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).approveCredential({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  removeCredential: userProcedure
    .meta(
      openApiMeta(
        "career",
        "DELETE",
        "/credentials/by-id/{credentialId}",
        "Removes a credential"
      )
    )
    .input(z.object({ credentialId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).removeCredential({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  acceptProposal: userProcedure
    .meta(
      openApiMeta(
        "career",
        "POST",
        "/timeline-proposals/by-id/{timelineProposalId}/accept",
        "Applies a timeline change the interviewer proposed"
      )
    )
    .input(z.object({ timelineProposalId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).acceptProposal({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  rejectProposal: userProcedure
    .meta(
      openApiMeta(
        "career",
        "POST",
        "/timeline-proposals/by-id/{timelineProposalId}/reject",
        "Dismisses a proposed timeline change"
      )
    )
    .input(z.object({ timelineProposalId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).rejectProposal({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  requestNarrative: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "career",
        "POST",
        "/career/narrative",
        "Drafts the career narrative"
      )
    )
    .input(z.object({}))
    .output(z.object({ realtime: realtimeSubscriptionSchema }))
    .mutation(({ ctx }) => new CareerService(db).requestNarrative(ctx.userId)),

  approveNarrative: userProcedure
    .meta(
      openApiMeta(
        "career",
        "POST",
        "/career/narratives/by-id/{narrativeId}/approve",
        "Approves the career narrative"
      )
    )
    .input(z.object({ narrativeId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).approveNarrative({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),
});
