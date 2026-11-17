import { z } from "zod";

export const evidenceKinds = [
  "achievement",
  "responsibility",
  "metric",
  "tool",
  "award",
] as const;
export const evidenceKindSchema = z.enum(evidenceKinds);
export type EvidenceKind = z.infer<typeof evidenceKindSchema>;

export const sensitiveItemKinds = [
  "client",
  "codename",
  "figure",
  "person",
] as const;
export const sensitiveItemKindSchema = z.enum(sensitiveItemKinds);
export type SensitiveItemKind = z.infer<typeof sensitiveItemKindSchema>;

/** The user's general rule for a sensitive item, applied by code. */
export const sensitivityChoiceSchema = z.enum(["use", "generalize", "exclude"]);
export type SensitivityChoice = z.infer<typeof sensitivityChoiceSchema>;
