import type { DbClient } from "@repo/api/tools/db-client";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";

import { ChatRepository } from "./chat-repository";
import type { ChatContext, ChatMessage } from "./schemas/chat-message";

export class ChatService {
  constructor(
    private readonly db: DbClient,
    private readonly tasks = new TasksService(db)
  ) {}

  /**
   * Stores the user's message encrypted, then starts the turn's task with
   * only ids: the run loads and decrypts the message itself (ADR 0003).
   */
  async send(input: {
    userId: string;
    context: ChatContext;
    message: string;
  }): Promise<{ message: ChatMessage; realtime: RealtimeSubscription }> {
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "chat_turn",
    });
    const row = await this.db.transaction(async (tx) => {
      const cipher = await getUserCipher(tx, input.userId);
      return new ChatRepository(tx).insert({
        userId: input.userId,
        context: input.context,
        author: "user",
        encryptedContent: cipher.encrypt(input.message),
      });
    });

    const { realtime } = await this.tasks.start({
      userId: input.userId,
      type: "chat_turn",
      subjectId: row.id,
    });

    return {
      message: { ...toChatMessage(row), content: input.message },
      realtime,
    };
  }

  async list(input: {
    userId: string;
    context: ChatContext;
  }): Promise<ChatMessage[]> {
    return this.db.transaction(async (tx) => {
      const rows = await new ChatRepository(tx).listForUser(input);
      const cipher = await getUserCipher(tx, input.userId);

      return rows.map((row) => ({
        ...toChatMessage(row),
        content: row.encryptedContent
          ? cipher.decrypt(row.encryptedContent)
          : null,
      }));
    });
  }
}

function toChatMessage(row: {
  id: string;
  author: ChatMessage["author"];
  kind: ChatMessage["kind"];
  createdAt: Date;
}): ChatMessage {
  return {
    id: row.id,
    author: row.author,
    kind: row.kind,
    content: null,
    createdAt: row.createdAt,
  };
}
