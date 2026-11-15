import { z } from "zod";

export const aiKeyStatusSchema = z.enum(["active", "out_of_credit", "refused"]);
export type AiKeyStatus = z.infer<typeof aiKeyStatusSchema>;

/** The user's key as the interface shows it: never the key itself. */
export const aiKeyViewSchema = z.object({
  provider: z.literal("anthropic"),
  lastCharacters: z.string(),
  status: aiKeyStatusSchema,
  statusChangedAt: z.date().nullable(),
  createdAt: z.date(),
});
export type AiKeyView = z.infer<typeof aiKeyViewSchema>;
