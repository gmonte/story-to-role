import { z } from "zod";

import { interviewLanguageSchema } from "@repo/api/domains/career/schemas/career";

/** Output languages come from a tested list (resume spec, "Output language"). */
export const outputLanguageSchema = interviewLanguageSchema;
export type OutputLanguage = z.infer<typeof outputLanguageSchema>;

export const documentKindSchema = z.enum([
  "resume",
  "cover_letter",
  "linkedin",
]);
export type DocumentKind = z.infer<typeof documentKindSchema>;

/** How a snapshot came to be; the interface calls snapshots "changes". */
export const snapshotOriginSchema = z.enum([
  "generated",
  "adapted",
  "edited",
  "restored",
  "copied",
  // A document agent's suggestion the user accepted (ADR 0009).
  "suggested",
  // The version moved to a newer profile version: the same text, its
  // traces and checks read against that version ("Use version N").
  "rebased",
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

/** A sync ends as a proposal the user accepts or discards. */
export const generationStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "proposed",
  "discarded",
]);
export type GenerationStatus = z.infer<typeof generationStatusSchema>;

/**
 * What a generation does: write from the evidence, adapt a version into
 * another language, or carry one version's changes into another (sync).
 */
export const generationKindSchema = z.enum([
  "generate",
  "adapt",
  "sync",
  // A cover letter adjusted to what changed in its resume (a proposal).
  "letter_update",
  // One section of the LinkedIn text written again (`generations.section`).
  "linkedin_section",
  // The coverage review of a LinkedIn text as it is, the last step of its
  // guided flow: no snapshot of its own.
  "linkedin_review",
]);
export type GenerationKind = z.infer<typeof generationKindSchema>;

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
  // A cover letter paragraph: profile lines (the career direction among
  // them), approved company facts, the motivation interview's points and
  // the application's instructions.
  z.object({
    kind: z.literal("letter"),
    evidenceIds: z.array(z.uuid()),
    companyFactIds: z.array(z.uuid()),
    motivationPointIds: z.array(z.uuid()),
    instructionIds: z.array(z.uuid()).default([]),
  }),
  z.object({ kind: z.literal("credential"), credentialId: z.uuid() }),
  z.object({ kind: z.literal("skill"), evidenceIds: z.array(z.uuid()) }),
  // A traced line the user reworded in the editor: it keeps the sources
  // of the line it came from (resume spec, "Trace in the editor").
  z.object({
    kind: z.literal("edited"),
    evidenceIds: z.array(z.uuid()),
    instructionIds: z.array(z.uuid()).default([]),
    companyFactIds: z.array(z.uuid()).default([]),
    motivationPointIds: z.array(z.uuid()).default([]),
  }),
]);
export type LineOrigin = z.infer<typeof lineOriginSchema>;

export const lineSchema = z.object({
  id: z.string(),
  text: z.string(),
  origin: lineOriginSchema,
});
export type Line = z.infer<typeof lineSchema>;
