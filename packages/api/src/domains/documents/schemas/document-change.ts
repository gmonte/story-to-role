import { z } from "zod";

/** Who proposed a change to a document (ADR 0009). */
export const documentChangeOriginSchema = z.enum(["document_agent"]);
export type DocumentChangeOrigin = z.infer<typeof documentChangeOriginSchema>;

export const documentChangeStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  // A newer change rewrote the same lines before the user answered.
  "superseded",
]);
export type DocumentChangeStatus = z.infer<typeof documentChangeStatusSchema>;

/**
 * A part of a document a change targets (resume spec, "Document
 * workspace"): the summary, the skills, one position's or project's
 * bullets, or the letter's paragraphs. Everything else is locked.
 */
export const documentPartKeySchema = z.string().min(1);

/** What a change's row holds, encrypted. */
export const documentChangeContentSchema = z.object({
  part: documentPartKeySchema,
  // The lines it replaces (one per line); empty adds at the part's end.
  find: z.string(),
  // The lines it writes; empty removes the lines.
  replace: z.string(),
  reason: z.string(),
  // The profile passages (evidence ids of the frozen version) it rests on.
  evidenceIds: z.array(z.uuid()),
});
export type DocumentChangeContent = z.infer<typeof documentChangeContentSchema>;

export const documentChangeSchema = documentChangeContentSchema.extend({
  id: z.uuid(),
  versionId: z.uuid(),
  origin: documentChangeOriginSchema,
  createdAt: z.date(),
});
export type DocumentChange = z.infer<typeof documentChangeSchema>;
