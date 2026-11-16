import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";

import { CareerChatRepository } from "./career-chat-repository";

/**
 * What the career chat has yet to say about the user's finished imports,
 * oldest first. The chat id leads to the profile: nothing the browser sends
 * picks whose imports these are. They stay unsaid until
 * `markImportReactionsSaid`, after the chat said them.
 */
export async function pendingImportReactions(db: DbClient, chatId: string) {
  const chat = await new CareerChatRepository(db).findChat(chatId);
  if (!chat) return null;
  const career = new CareerRepository(db);
  const profile = await career.findProfileById(chat.profileId);
  if (!profile) return null;
  const rows = await career.listImportReactions(profile.id);
  if (rows.length === 0) return null;
  const cipher = await getUserCipher(db, profile.userId);
  return {
    sourceDocumentIds: rows.map((row) => row.sourceDocumentId),
    text: rows
      .map((row) => cipher.decrypt(row.encryptedReaction!))
      .join("\n\n"),
  };
}

export function markImportReactionsSaid(
  db: DbClient,
  sourceDocumentIds: string[]
) {
  return new CareerRepository(db).markImportReactionsSaid(sourceDocumentIds);
}
