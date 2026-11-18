import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";
import { AgentChatRepository } from "@repo/api/domains/agents/agent-chat-repository";

/**
 * What the agent has yet to say about the user's finished imports (profile
 * spec: "When it ends, the agent sums up what was proposed and what is
 * still missing"), oldest first. The chat id leads to its user: nothing
 * the browser sends picks whose imports these are. They stay unsaid until
 * `markImportSummariesSaid`, after the chat said them.
 */
export async function pendingImportSummaries(db: DbClient, chatId: string) {
  const chat = await new AgentChatRepository(db).findChat(chatId);
  if (!chat) return null;
  const career = new CareerRepository(db);
  const profile = await career.findProfileByUserId(chat.userId);
  if (!profile) return null;
  const rows = await career.listUnsaidImportSummaries(profile.id);
  if (rows.length === 0) return null;
  const cipher = await getUserCipher(db, chat.userId);
  return {
    sourceDocumentIds: rows.map((row) => row.sourceDocumentId),
    text: rows
      .map((row) => cipher.decrypt(row.encryptedImportSummary!))
      .join("\n\n"),
  };
}

export function markImportSummariesSaid(
  db: DbClient,
  sourceDocumentIds: string[]
) {
  return new CareerRepository(db).markImportSummariesSaid(sourceDocumentIds);
}
