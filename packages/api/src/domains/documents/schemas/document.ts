import { z } from "zod";

import { interviewLanguageSchema } from "@repo/api/domains/career/schemas/career";

/** Output languages come from a tested list (resume spec, "Output language"). */
export const outputLanguageSchema = interviewLanguageSchema;
export type OutputLanguage = z.infer<typeof outputLanguageSchema>;

export const documentKindSchema = z.enum(["resume", "cover_letter"]);
export type DocumentKind = z.infer<typeof documentKindSchema>;

/** How a snapshot came to be; the interface calls snapshots "changes". */
export const snapshotOriginSchema = z.enum([
  "generated",
  "adapted",
  "edited",
  "restored",
  "copied",
]);
export type SnapshotOrigin = z.infer<typeof snapshotOriginSchema>;

export const snapshotAuthorSchema = z.enum(["user", "ai"]);
export type SnapshotAuthor = z.infer<typeof snapshotAuthorSchema>;

/** Quick is one review round; Thorough allows more (a setting). */
export const reviewDepthSchema = z.enum(["quick", "thorough"]);
export type ReviewDepth = z.infer<typeof reviewDepthSchema>;

/** Standard uses the package's writing model; maximum its top model. */
export const writingLevelSchema = z.enum(["standard", "maximum"]);
export type WritingLevel = z.infer<typeof writingLevelSchema>;

export const generationStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);
export type GenerationStatus = z.infer<typeof generationStatusSchema>;

/**
 * Where a line came from, shown in the editor's trace: approved evidence
 * (by id), this application's instructions, or the user's own edit. A line
 * built from code (a locked fact, a credential) traces to its record.
 */
export const lineOriginSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("evidence"),
    evidenceIds: z.array(z.uuid()).min(1),
  }),
  // Rests on the application's instructions, and maybe on evidence too.
  z.object({
    kind: z.literal("instruction"),
    instructionIds: z.array(z.uuid()).min(1),
    evidenceIds: z.array(z.uuid()),
  }),
  z.object({ kind: z.literal("manual") }),
  z.object({ kind: z.literal("credential"), credentialId: z.uuid() }),
  z.object({ kind: z.literal("skill"), evidenceIds: z.array(z.uuid()) }),
]);
export type LineOrigin = z.infer<typeof lineOriginSchema>;

export const lineSchema = z.object({
  id: z.string(),
  text: z.string(),
  origin: lineOriginSchema,
});
export type Line = z.infer<typeof lineSchema>;
