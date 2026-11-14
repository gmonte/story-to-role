import type { AiClient } from "@repo/api/domains/ai/ai-client";
import { replyToChatMessage } from "@repo/api/domains/ai/topic-gate";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";

import { ChatRepository } from "./chat-repository";

/**
 * Until the guided interview (slice 2) and openings (slice 3) bring their
 * own agents, an on-topic message gets a short answer from the writing role.
 */
const interimSystemPrompt = [
  "You are StoryToRole, an assistant that turns a person's career story into tailored resumes and cover letters.",
  "The guided interview is not available yet. Answer the user's message briefly, in plain text without Markdown, in the language they wrote in, without assuming any fact about their career they did not state.",
].join("\n");

/**
 * One chat turn, inside its task: decrypts the user's message, lets the
 * topic gate judge it, and stores the reply. An off-topic message gets the
 * fixed reply and never reaches the main model.
 */
export async function runChatTurn({
  db,
  ai,
  userId,
  chatMessageId,
}: {
  db: DbClient;
  ai: AiClient;
  userId: string;
  chatMessageId: string;
}) {
  const repository = new ChatRepository(db);
  const message = await repository.findForUser({ chatMessageId, userId });
  if (!message?.encryptedContent) {
    throw new Error(`Chat message ${chatMessageId} has no content`);
  }

  const cipher = await getUserCipher(db, userId);
  const text = cipher.decrypt(message.encryptedContent);

  const reply = await replyToChatMessage({
    ai,
    context: message.context,
    message: text,
    answer: async () => {
      const { text: answer } = await ai.generateText({
        purpose: "chat_answer",
        role: "writing",
        maxTokens: 2048,
        system: interimSystemPrompt,
        messages: [{ role: "user", content: text }],
      });
      return answer;
    },
  });

  await repository.insert({
    userId,
    context: message.context,
    author: "assistant",
    kind: reply.kind === "off_topic" ? "off_topic" : "text",
    encryptedContent:
      reply.kind === "answer" ? cipher.encrypt(reply.text) : null,
  });
}
