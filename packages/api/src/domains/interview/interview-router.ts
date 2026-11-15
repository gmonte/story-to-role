import { z } from "zod";

import { sensitivityChoiceSchema } from "@repo/api/domains/evidence/schemas/evidence";
import { realtimeSubscriptionSchema } from "@repo/api/domains/tasks/schemas/task";
import { db } from "@repo/api/tools/db";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
} from "@repo/api/tools/trpc";

import { InterviewService } from "./interview-service";
import {
  extractionDecisionSchema,
  sensitiveItemViewSchema,
  sessionViewSchema,
} from "./schemas/session-view";

const ok = z.object({ ok: z.literal(true) });
const done = { ok: true as const };

const meta = (
  method: "GET" | "POST" | "PUT",
  path: `/${string}`,
  summary: string
) => ({
  openapi: { method, path, tags: ["interview"], summary, protect: true },
});

export const interviewRouter = createTRPCRouter({
  openSession: userProcedure
    .meta(
      meta(
        "POST",
        "/interview/sessions",
        "Resumes or opens the interview session of a position or credential"
      )
    )
    .input(
      z.object({
        positionId: z.uuid().optional(),
        credentialId: z.uuid().optional(),
      })
    )
    .output(z.object({ sessionId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      new InterviewService(db).openSession({ userId: ctx.userId, ...input })
    ),

  openSessions: userProcedure
    .meta(
      meta(
        "GET",
        "/interview/sessions",
        "Lists the user's open interview sessions"
      )
    )
    .input(z.object({}))
    .output(
      z.array(
        z.object({
          sessionId: z.uuid(),
          positionId: z.uuid().nullable(),
          credentialId: z.uuid().nullable(),
        })
      )
    )
    .query(({ ctx }) => new InterviewService(db).listOpenSessions(ctx.userId)),

  session: userProcedure
    .meta(
      meta(
        "GET",
        "/interview/sessions/by-id/{sessionId}",
        "Returns an interview session with its turns and drafts"
      )
    )
    .input(z.object({ sessionId: z.uuid() }))
    .output(sessionViewSchema)
    .query(({ ctx, input }) =>
      new InterviewService(db).getSession({ userId: ctx.userId, ...input })
    ),

  sendMessage: userProcedure
    .use(rateLimited("chatMessage"))
    .meta(
      meta(
        "POST",
        "/interview/sessions/by-id/{sessionId}/messages",
        "Sends a message to the interviewer"
      )
    )
    .input(
      z.object({ sessionId: z.uuid(), message: z.string().min(1).max(4000) })
    )
    .output(z.object({ realtime: realtimeSubscriptionSchema }))
    .mutation(({ ctx, input }) =>
      new InterviewService(db).sendMessage({ userId: ctx.userId, ...input })
    ),

  proposeExtraction: userProcedure
    .meta(
      meta(
        "POST",
        "/interview/sessions/by-id/{sessionId}/extraction",
        "Opens the approval screen for the session"
      )
    )
    .input(z.object({ sessionId: z.uuid() }))
    .output(ok)
    .mutation(async ({ ctx, input }) => {
      await new InterviewService(db).proposeExtraction({
        userId: ctx.userId,
        ...input,
      });
      return done;
    }),

  approveExtraction: userProcedure
    .meta(
      meta(
        "POST",
        "/interview/sessions/by-id/{sessionId}/extraction/approve",
        "Approves the extracted facts"
      )
    )
    .input(
      z.object({
        sessionId: z.uuid(),
        decisions: z.array(extractionDecisionSchema),
        closePosition: z.boolean(),
      })
    )
    .output(z.object({ nextSessionId: z.uuid().nullable() }))
    .mutation(({ ctx, input }) =>
      new InterviewService(db).approveExtraction({
        userId: ctx.userId,
        ...input,
      })
    ),

  sensitiveItems: userProcedure
    .meta(
      meta(
        "GET",
        "/sensitive-items",
        "Lists the sensitive items and their choices"
      )
    )
    .input(z.object({}))
    .output(z.array(sensitiveItemViewSchema))
    .query(({ ctx }) =>
      new InterviewService(db).listSensitiveItems(ctx.userId)
    ),

  setSensitiveChoice: userProcedure
    .meta(
      meta(
        "PUT",
        "/sensitive-items/by-id/{sensitiveItemId}",
        "Sets use, generalize or exclude for a sensitive item"
      )
    )
    .input(
      z.object({
        sensitiveItemId: z.uuid(),
        choice: sensitivityChoiceSchema,
        generalized: z.string().max(300).optional(),
      })
    )
    .output(ok)
    .mutation(async ({ ctx, input }) => {
      await new InterviewService(db).setSensitiveChoice({
        userId: ctx.userId,
        ...input,
      });
      return done;
    }),
});
