import { z } from "zod";

/** What kind of contradiction a reviewer found (resume spec, "Review rounds"). */
export const inconsistencyKinds = [
  "wrong_fact",
  "wrong_figure",
  "overstated_authorship",
  "denied_or_unknown",
  "wrong_nature",
  "unsupported_tool",
  "other",
] as const;
export const inconsistencyKindSchema = z.enum(inconsistencyKinds);

/**
 * A resume passage that states what the profile denies or doesn't support:
 * the exact `quote` from the resume and the `profileLine` it contradicts.
 */
export const inconsistencySchema = z.object({
  quote: z.string(),
  profileLine: z.string(),
  kind: inconsistencyKindSchema.catch("other"),
});
export type Inconsistency = z.infer<typeof inconsistencySchema>;

/**
 * An inconsistency as stored or shown: reviews stored before the proof was
 * required hold plain strings, read as a text-only one.
 */
export const storedInconsistencySchema = z.union([
  inconsistencySchema.extend({ text: z.string().nullable().default(null) }),
  z.string().transform((text) => ({
    quote: "",
    profileLine: "",
    kind: "other" as const,
    text: text as string | null,
  })),
]);
export type StoredInconsistency = z.infer<typeof storedInconsistencySchema>;

/** One line for the editor: the quote and what the profile says. */
export function inconsistencyText(item: StoredInconsistency) {
  if (!item.quote) return item.text ?? "";
  return item.profileLine
    ? `“${item.quote}” — profile: ${item.profileLine}`
    : `“${item.quote}”`;
}

/** An inconsistency as the interface receives it (always one shape). */
export const inconsistencyViewSchema = z.object({
  quote: z.string(),
  profileLine: z.string(),
  kind: inconsistencyKindSchema,
  text: z.string().nullable(),
});
