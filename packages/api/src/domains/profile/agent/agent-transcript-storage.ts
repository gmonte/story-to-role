import type {
  TranscriptCursors,
  TranscriptLoadResult,
  TranscriptStorage,
} from "@trigger.dev/sdk/ai";
import type { UIMessage } from "ai";

import {
  getUserCipher,
  type UserCipher,
} from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";

import { AgentChatRepository } from "./agent-chat-repository";

/**
 * The agent conversation's transcript in our own tables, each message
 * encrypted with the user's data key, so Trigger.dev keeps no copy of its
 * own (ADR 0007). The chat id leads to its user; nothing the browser sends
 * decides whose cipher opens it.
 */
export function createAgentTranscriptStorage(db: DbClient): TranscriptStorage {
  async function open(chatId: string) {
    const chat = await new AgentChatRepository(db).findChat(chatId);
    if (!chat) return null;
    return { chat, cipher: await getUserCipher(db, chat.userId) };
  }

  const decryptMessage = (cipher: UserCipher, encrypted: string) =>
    JSON.parse(cipher.decrypt(encrypted)) as UIMessage;

  return {
    async load<TUIMessage extends UIMessage = UIMessage>(
      { chatId }: { chatId: string },
      opts?: { limit?: number; before?: string }
    ): Promise<TranscriptLoadResult<TUIMessage>> {
      const opened = await open(chatId);
      if (!opened) return { messages: [], state: null };
      const { chat, cipher } = opened;

      let rows = await new AgentChatRepository(db).listMessages(chatId);
      if (opts?.before) {
        const anchor = rows.findIndex((row) => row.messageId === opts.before);
        rows = anchor === -1 ? [] : rows.slice(0, anchor);
      }
      let nextCursor: string | undefined;
      if (opts?.limit && rows.length > opts.limit) {
        rows = rows.slice(-opts.limit);
        nextCursor = rows[0]?.messageId;
      }

      const cursors: TranscriptCursors = {
        lastOutEventId: chat.lastOutEventId ?? undefined,
        lastInEventId: chat.lastInEventId ?? undefined,
      };
      return {
        messages: rows.map(
          (row) => decryptMessage(cipher, row.encryptedMessage) as TUIMessage
        ),
        state: chat.encryptedState
          ? (JSON.parse(cipher.decrypt(chat.encryptedState)) as unknown)
          : null,
        cursors,
        nextCursor,
        nonFinalIds: rows
          .filter((row) => !row.final)
          .map((row) => row.messageId),
      };
    },

    async save({ chatId }, changeset) {
      const opened = await open(chatId);
      // The row is made before the session starts (AgentChatService).
      if (!opened) throw new Error("Unknown profile chat");
      const { cipher } = opened;

      await db.transaction(async (tx) => {
        const chats = new AgentChatRepository(tx);
        let next = (await chats.lastPosition(chatId)) + 1;

        for (const change of changeset.changes) {
          switch (change.op) {
            case "put": {
              const encryptedMessage = cipher.encrypt(
                JSON.stringify(change.message)
              );
              const final = change.final !== false;
              // A known id keeps its place: approvals and partials replace
              // a message where it stands.
              if (await chats.findMessage(chatId, change.message.id)) {
                await chats.replaceMessage({
                  chatId,
                  messageId: change.message.id,
                  encryptedMessage,
                  final,
                });
              } else {
                await chats.insertMessage({
                  chatId,
                  messageId: change.message.id,
                  position: next++,
                  encryptedMessage,
                  final,
                });
              }
              break;
            }
            case "remove":
              await chats.deleteMessage(chatId, change.id);
              break;
            case "truncateAfter": {
              const anchor = await chats.findMessage(chatId, change.afterId);
              if (anchor) {
                await chats.deleteMessagesAfter(chatId, anchor.position);
                next = anchor.position + 1;
              }
              break;
            }
            case "state":
              await chats.updateChat(chatId, {
                encryptedState:
                  change.value === null
                    ? null
                    : cipher.encrypt(JSON.stringify(change.value)),
              });
              break;
          }
        }

        if (changeset.cursors) {
          await chats.updateChat(chatId, {
            lastOutEventId: changeset.cursors.lastOutEventId ?? null,
            lastInEventId: changeset.cursors.lastInEventId ?? null,
          });
        }
      });
    },
  };
}
