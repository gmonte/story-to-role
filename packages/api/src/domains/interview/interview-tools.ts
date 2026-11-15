import { z } from "zod";

import {
  ToolRefusal,
  type AiTool,
} from "@repo/api/domains/ai/providers/provider-package";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { projectsTable } from "@repo/api/domains/career/db/career-tables";
import {
  type timelineProposalKindSchema,
  yearMonthSchema,
  type InterviewLanguage,
} from "@repo/api/domains/career/schemas/career";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { sensitiveItemKindSchema } from "@repo/api/domains/evidence/schemas/evidence";
import type { DbClient } from "@repo/api/tools/db-client";

import { InterviewRepository } from "./interview-repository";
import { findQuote } from "./quotes/verify-quote";
import { interviewStageSchema } from "./schemas/interview";

export type InterviewToolContext = {
  db: DbClient;
  cipher: UserCipher;
  profileId: string;
  sessionId: string;
  positionId: string | null;
  projectId: string | null;
  language: InterviewLanguage;
  // The user's turns of this session: the only words a fact may rest on.
  userTurns: Array<{ id: string; content: string }>;
  // Positions of the timeline the agent may refer to.
  positionIds: string[];
};

function tool<T extends z.ZodObject>(
  name: string,
  description: string,
  schema: T,
  handler: (input: z.infer<T>) => Promise<string>
): AiTool {
  return {
    name,
    description,
    schema,
    handler: (input) => handler(input as z.infer<T>),
  };
}

/** The quote must be the user's exact words from this session (principle 2). */
function locateQuote(context: InterviewToolContext, quote: string) {
  for (const turn of [...context.userTurns].reverse()) {
    const found = findQuote(turn.content, quote);
    if (found) return { quote: found, turnId: turn.id };
  }
  throw new ToolRefusal(
    "The quote is not in the user's messages of this session. Copy the user's exact words, or ask the user."
  );
}

function requireKnownPosition(
  context: InterviewToolContext,
  positionId: string
) {
  if (!context.positionIds.includes(positionId)) {
    throw new ToolRefusal(
      `Unknown position id ${positionId}. Use an id from the timeline.`
    );
  }
}

/**
 * The position agent's tools (guided interview spec, "Agent tools"). Each
 * validates its input and writes through the repositories; timeline changes
 * only create proposal cards the user confirms.
 */
export function createInterviewTools(context: InterviewToolContext): AiTool[] {
  const interview = new InterviewRepository(context.db);
  const career = new CareerRepository(context.db);
  const { cipher } = context;

  const proposeTimelineChange = async (
    kind: z.infer<typeof timelineProposalKindSchema>,
    payload: Record<string, string | undefined>
  ) => {
    // The same change, still awaiting the user, is never proposed twice.
    const { reason: _reason, ...change } = payload;
    const pending = await career.listPendingProposals(context.profileId);
    const duplicate = pending.some((proposal) => {
      if (proposal.kind !== kind) return false;
      const { reason: _r, ...existing } = JSON.parse(
        cipher.decrypt(proposal.encryptedPayload)
      ) as Record<string, string | undefined>;
      return JSON.stringify(existing) === JSON.stringify(change);
    });
    if (duplicate) {
      return "This change is already suggested and awaiting the user. Do not suggest it again; continue the interview.";
    }

    await career.insertProposal({
      profileId: context.profileId,
      sessionId: context.sessionId,
      kind,
      encryptedPayload: cipher.encrypt(JSON.stringify(payload)),
    });
    return "Proposal shown to the user as a card. Nothing changes until they confirm it.";
  };

  return [
    tool(
      "save_draft_fact",
      "Store a fact the user stated about the current position, as a draft for the approval screen. Use one call per fact.",
      z.object({
        kind: z.enum([
          "achievement",
          "responsibility",
          "metric",
          "tool",
          "award",
          "skill",
        ]),
        text: z
          .string()
          .min(1)
          .max(500)
          .describe(
            "The fact, written concisely in the user's language, adding nothing they did not say."
          ),
        quote: z
          .string()
          .min(1)
          .max(1000)
          .describe(
            "The user's exact words this fact rests on, copied from their message."
          ),
        low_detail: z
          .boolean()
          .optional()
          .describe("True when the user stayed vague after one follow-up."),
      }),
      async (input) => {
        const { quote, turnId } = locateQuote(context, input.quote);
        await interview.insertDraft({
          sessionId: context.sessionId,
          kind: input.kind,
          encryptedPayload: cipher.encrypt(
            JSON.stringify({ text: input.text })
          ),
          encryptedQuote: cipher.encrypt(quote),
          sourceTurnId: turnId,
          projectId: context.projectId,
          language: context.language,
          lowDetail: input.low_detail ?? false,
        });
        return "Saved as a draft.";
      }
    ),

    tool(
      "save_story",
      "Store a story (problem, the user's action, partners, result) as a draft for the approval screen.",
      z.object({
        problem: z.string().min(1).max(800),
        action: z
          .string()
          .min(1)
          .max(800)
          .describe("What the user did; the user is the subject."),
        partners: z
          .string()
          .max(300)
          .optional()
          .describe("Who the user worked with, credited at the end."),
        result: z.string().min(1).max(800),
        quote: z
          .string()
          .min(1)
          .max(1500)
          .describe("The user's exact words the story rests on."),
      }),
      async ({ quote: rawQuote, ...story }) => {
        const { quote, turnId } = locateQuote(context, rawQuote);
        await interview.insertDraft({
          sessionId: context.sessionId,
          kind: "story",
          encryptedPayload: cipher.encrypt(JSON.stringify(story)),
          encryptedQuote: cipher.encrypt(quote),
          sourceTurnId: turnId,
          projectId: context.projectId,
          language: context.language,
        });
        return "Story saved as a draft.";
      }
    ),

    tool(
      "flag_sensitive_item",
      "Mark a client name, project codename, explicit confidential figure or person's name for the sensitive-data review.",
      z.object({
        kind: sensitiveItemKindSchema,
        original: z
          .string()
          .min(1)
          .max(200)
          .describe("The text exactly as the user wrote it."),
        suggested_generalization: z
          .string()
          .max(300)
          .optional()
          .describe(
            'A description that hides it, e.g. "the largest private bank in the country".'
          ),
      }),
      async (input) => {
        await interview.insertDraftSensitiveItem({
          sessionId: context.sessionId,
          kind: input.kind,
          encryptedOriginal: cipher.encrypt(input.original),
          encryptedSuggestedGeneralization: input.suggested_generalization
            ? cipher.encrypt(input.suggested_generalization)
            : null,
        });
        return "Flagged for review.";
      }
    ),

    tool(
      "note_for_position",
      "Leave a note on another position the user mentioned, for when that position is interviewed.",
      z.object({ position_id: z.string(), note: z.string().min(1).max(500) }),
      async (input) => {
        requireKnownPosition(context, input.position_id);
        await career.insertCrossNote({
          fromPositionId: context.positionId,
          toPositionId: input.position_id,
          encryptedText: cipher.encrypt(input.note),
        });
        // A note on an approved position reopens it (guided interview spec).
        const target = await career.findPosition({
          profileId: context.profileId,
          positionId: input.position_id,
        });
        if (target?.status === "approved") {
          await career.updatePosition(target.id, { status: "in_progress" });
          return "Note saved; that position was reopened so the user can review it.";
        }
        return "Note saved on that position.";
      }
    ),

    tool(
      "set_stage",
      "Record the stage of the script the interview is in now.",
      z.object({ stage: interviewStageSchema }),
      async ({ stage }) => {
        await interview.updateSession(context.sessionId, { stage });
        return `Stage set to ${stage}.`;
      }
    ),

    tool(
      "open_subsession",
      "Start focusing on one project of a long position; facts saved afterwards belong to it.",
      z.object({ project_name: z.string().min(1).max(200) }),
      async ({ project_name }) => {
        if (!context.positionId)
          throw new ToolRefusal("Only positions have projects.");
        const [project] = await context.db
          .insert(projectsTable)
          .values({
            positionId: context.positionId,
            encryptedName: cipher.encrypt(project_name),
          })
          .returning();
        await interview.updateSession(context.sessionId, {
          projectId: project.id,
        });
        context.projectId = project.id;
        return `Now on project ${project_name}.`;
      }
    ),

    tool(
      "close_subsession",
      "Finish the current project and return to the position as a whole.",
      z.object({}),
      async () => {
        await interview.updateSession(context.sessionId, { projectId: null });
        context.projectId = null;
        return "Back to the position as a whole.";
      }
    ),

    tool(
      "propose_update_position",
      "Propose correcting the current position's employer, title, dates or location when the user corrects them (stage confirm). Applies only if the user confirms; never say it is already changed.",
      z.object({
        employer: z.string().min(1).max(200).optional(),
        title: z.string().min(1).max(200).optional(),
        start_date: yearMonthSchema.optional(),
        end_date: yearMonthSchema.optional(),
        still_there: z
          .boolean()
          .optional()
          .describe("True when the user still holds the position."),
        location: z.string().max(200).optional(),
        reason: z.string().max(300),
      }),
      async (input) => {
        if (!context.positionId)
          throw new ToolRefusal("There is no position to correct.");
        return proposeTimelineChange("update_position", {
          positionId: context.positionId,
          employer: input.employer,
          title: input.title,
          startDate: input.start_date,
          endDate: input.still_there ? "current" : input.end_date,
          location: input.location,
          reason: input.reason,
        });
      }
    ),

    tool(
      "propose_resolve_conflict",
      "When the user says which of two conflicting values (from different files) is right, propose choosing it. Applies only if the user confirms.",
      z.object({
        position_conflict_id: z.string(),
        value: z
          .string()
          .min(1)
          .describe("One of the conflict's options, exactly as listed."),
        reason: z.string().max(300),
      }),
      async (input) => {
        const conflict = await career.findConflict(input.position_conflict_id);
        if (!conflict || !context.positionIds.includes(conflict.positionId)) {
          throw new ToolRefusal("Unknown conflict id.");
        }
        const options = JSON.parse(
          cipher.decrypt(conflict.encryptedOptions)
        ) as string[];
        if (!options.includes(input.value)) {
          throw new ToolRefusal(
            `The value must be one of: ${options.join(", ")}.`
          );
        }
        return proposeTimelineChange("resolve_conflict", {
          positionId: conflict.positionId,
          positionConflictId: conflict.id,
          value: input.value,
          reason: input.reason,
        });
      }
    ),

    tool(
      "propose_add_position",
      "Propose a missing position (a short contract, a promotion worth its own entry). Applies only if the user confirms.",
      z.object({
        employer: z.string().min(1).max(200),
        title: z.string().min(1).max(200),
        start_date: yearMonthSchema.optional(),
        end_date: yearMonthSchema.optional(),
        location: z.string().max(200).optional(),
        reason: z.string().max(300),
      }),
      (input) =>
        proposeTimelineChange("add_position", {
          employer: input.employer,
          title: input.title,
          startDate: input.start_date,
          endDate: input.end_date,
          location: input.location,
          reason: input.reason,
        })
    ),

    tool(
      "propose_remove_position",
      "Propose removing a position (a duplicate, an internship the user wants out). Its evidence is kept hidden so it can be restored.",
      z.object({ position_id: z.string(), reason: z.string().max(300) }),
      async (input) => {
        requireKnownPosition(context, input.position_id);
        return proposeTimelineChange("remove_position", {
          positionId: input.position_id,
          reason: input.reason,
        });
      }
    ),

    tool(
      "propose_merge_positions",
      "Propose joining two entries that are the same position.",
      z.object({
        position_id: z.string(),
        into_position_id: z.string(),
        reason: z.string().max(300),
      }),
      async (input) => {
        requireKnownPosition(context, input.position_id);
        requireKnownPosition(context, input.into_position_id);
        return proposeTimelineChange("merge_positions", {
          positionId: input.position_id,
          intoPositionId: input.into_position_id,
          reason: input.reason,
        });
      }
    ),

    tool(
      "propose_split_position",
      "Propose splitting a position in two, e.g. a promotion with a new scope starting at start_date.",
      z.object({
        position_id: z.string(),
        title: z.string().min(1).max(200),
        start_date: yearMonthSchema,
        reason: z.string().max(300),
      }),
      async (input) => {
        requireKnownPosition(context, input.position_id);
        return proposeTimelineChange("split_position", {
          positionId: input.position_id,
          title: input.title,
          startDate: input.start_date,
          reason: input.reason,
        });
      }
    ),

    tool(
      "propose_extraction",
      "Build the approval screen from this session's drafts, when the position is covered or the user is done.",
      z.object({}),
      async () => {
        await interview.updateSession(context.sessionId, {
          extractionProposedAt: new Date(),
        });
        return "The approval screen is ready for the user.";
      }
    ),
  ];
}
