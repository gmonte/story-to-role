import { z } from "zod";

import { realtimeSubscriptionSchema } from "@repo/api/domains/tasks/schemas/task";
import { db } from "@repo/api/tools/db";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
  type TRPCContext,
} from "@repo/api/tools/trpc";

import { CareerService } from "./career-service";
import { careerLanguageSchema, type CareerLanguage } from "./schemas/career";
import {
  credentialInputSchema,
  positionInputSchema,
  timelineSchema,
} from "./schemas/timeline";

const ok = z.object({ ok: z.literal(true) });
const done = { ok: true as const };

/** New profiles start in the interface language. */
function defaultLanguage(ctx: Pick<TRPCContext, "t">): CareerLanguage {
  return ctx.t.locale === "pt-BR" ? "pt-BR" : "en-US";
}

const meta = (
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: `/${string}`,
  summary: string
) => ({
  openapi: { method, path, tags: ["career"], summary, protect: true },
});

export const careerRouter = createTRPCRouter({
  timeline: userProcedure
    .meta(meta("GET", "/career/timeline", "Returns the user's career timeline"))
    .input(z.object({}))
    .output(timelineSchema)
    .query(({ ctx }) =>
      new CareerService(db).getTimeline({
        userId: ctx.userId,
        defaultLanguage: defaultLanguage(ctx),
      })
    ),

  updateSettings: userProcedure
    .meta(meta("PUT", "/career/settings", "Sets the interview language"))
    .input(z.object({ interviewLanguage: careerLanguageSchema }))
    .output(ok)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).updateSettings({
        userId: ctx.userId,
        ...input,
      });
      return done;
    }),

  acceptPrivacyNotice: userProcedure
    .meta(
      meta(
        "POST",
        "/career/privacy-notice",
        "Records that the user read the privacy notice"
      )
    )
    .input(z.object({}))
    .output(ok)
    .mutation(async ({ ctx }) => {
      await new CareerService(db).acceptPrivacyNotice(ctx.userId);
      return done;
    }),

  addPosition: userProcedure
    .meta(meta("POST", "/positions", "Adds a position by hand"))
    .input(positionInputSchema)
    .output(z.object({ positionId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      new CareerService(db).addPosition({ userId: ctx.userId, position: input })
    ),

  updatePosition: userProcedure
    .meta(meta("PUT", "/positions/by-id/{positionId}", "Edits a position"))
    .input(positionInputSchema.extend({ positionId: z.uuid() }))
    .output(ok)
    .mutation(async ({ ctx, input: { positionId, ...position } }) => {
      await new CareerService(db).updatePosition({
        userId: ctx.userId,
        positionId,
        position,
      });
      return done;
    }),

  removePosition: userProcedure
    .meta(
      meta(
        "DELETE",
        "/positions/by-id/{positionId}",
        "Removes a position (it can be restored)"
      )
    )
    .input(z.object({ positionId: z.uuid() }))
    .output(ok)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).removePosition({
        userId: ctx.userId,
        ...input,
      });
      return done;
    }),

  restorePosition: userProcedure
    .meta(
      meta(
        "POST",
        "/positions/by-id/{positionId}/restore",
        "Restores a removed position with its evidence"
      )
    )
    .input(z.object({ positionId: z.uuid() }))
    .output(ok)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).restorePosition({
        userId: ctx.userId,
        ...input,
      });
      return done;
    }),

  mergePositions: userProcedure
    .meta(
      meta(
        "POST",
        "/positions/by-id/{positionId}/merge",
        "Merges a position into another"
      )
    )
    .input(z.object({ positionId: z.uuid(), intoPositionId: z.uuid() }))
    .output(ok)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).mergePositions({
        userId: ctx.userId,
        ...input,
      });
      return done;
    }),

  resolveConflict: userProcedure
    .meta(
      meta(
        "POST",
        "/position-conflicts/by-id/{positionConflictId}/resolve",
        "Picks one side of a conflict"
      )
    )
    .input(z.object({ positionConflictId: z.uuid(), value: z.string().min(1) }))
    .output(ok)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).resolveConflict({
        userId: ctx.userId,
        conflictId: input.positionConflictId,
        value: input.value,
      });
      return done;
    }),

  addCredential: userProcedure
    .meta(meta("POST", "/credentials", "Adds a credential by hand"))
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
      meta("PUT", "/credentials/by-id/{credentialId}", "Edits a credential")
    )
    .input(credentialInputSchema.extend({ credentialId: z.uuid() }))
    .output(ok)
    .mutation(async ({ ctx, input: { credentialId, ...credential } }) => {
      await new CareerService(db).updateCredential({
        userId: ctx.userId,
        credentialId,
        credential,
      });
      return done;
    }),

  approveCredential: userProcedure
    .meta(
      meta(
        "POST",
        "/credentials/by-id/{credentialId}/approve",
        "Approves an imported credential"
      )
    )
    .input(z.object({ credentialId: z.uuid() }))
    .output(ok)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).approveCredential({
        userId: ctx.userId,
        ...input,
      });
      return done;
    }),

  removeCredential: userProcedure
    .meta(
      meta(
        "DELETE",
        "/credentials/by-id/{credentialId}",
        "Removes a credential"
      )
    )
    .input(z.object({ credentialId: z.uuid() }))
    .output(ok)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).removeCredential({
        userId: ctx.userId,
        ...input,
      });
      return done;
    }),

  acceptProposal: userProcedure
    .meta(
      meta(
        "POST",
        "/timeline-proposals/by-id/{timelineProposalId}/accept",
        "Applies a timeline change the interviewer proposed"
      )
    )
    .input(z.object({ timelineProposalId: z.uuid() }))
    .output(ok)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).acceptProposal({
        userId: ctx.userId,
        proposalId: input.timelineProposalId,
      });
      return done;
    }),

  rejectProposal: userProcedure
    .meta(
      meta(
        "POST",
        "/timeline-proposals/by-id/{timelineProposalId}/reject",
        "Dismisses a proposed timeline change"
      )
    )
    .input(z.object({ timelineProposalId: z.uuid() }))
    .output(ok)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).rejectProposal({
        userId: ctx.userId,
        proposalId: input.timelineProposalId,
      });
      return done;
    }),

  requestNarrative: userProcedure
    .use(rateLimited("taskStart"))
    .meta(meta("POST", "/career/narrative", "Drafts the career narrative"))
    .input(z.object({}))
    .output(z.object({ realtime: realtimeSubscriptionSchema }))
    .mutation(({ ctx }) => new CareerService(db).requestNarrative(ctx.userId)),

  approveNarrative: userProcedure
    .meta(
      meta(
        "POST",
        "/career/narratives/by-id/{narrativeId}/approve",
        "Approves the career narrative"
      )
    )
    .input(z.object({ narrativeId: z.uuid() }))
    .output(ok)
    .mutation(async ({ ctx, input }) => {
      await new CareerService(db).approveNarrative({
        userId: ctx.userId,
        ...input,
      });
      return done;
    }),
});
