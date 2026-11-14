import { z } from "zod";

/** Every chat belongs to a context (workspace spec: no general chat). */
export const chatContexts = [
  "career_interview",
  "opening",
  "document",
] as const;
export const chatContextSchema = z.enum(chatContexts);
export type ChatContext = z.infer<typeof chatContextSchema>;

/**
 * `text` carries content; `off_topic` is the fixed reply to a message the
 * topic gate refused, rendered by the interface in its own language.
 */
export const chatMessageKindSchema = z.enum(["text", "off_topic"]);
export type ChatMessageKind = z.infer<typeof chatMessageKindSchema>;

export const chatMessageAuthorSchema = z.enum(["user", "assistant"]);
export type ChatMessageAuthor = z.infer<typeof chatMessageAuthorSchema>;

export const chatMessageSchema = z.object({
  id: z.uuid(),
  author: chatMessageAuthorSchema,
  kind: chatMessageKindSchema,
  content: z.string().nullable(),
  createdAt: z.date(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;
