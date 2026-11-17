"use server";

import { auth } from "@trigger.dev/sdk";
import { chat } from "@trigger.dev/sdk/ai";

import { AgentChatService } from "@repo/api/domains/profile/agent/agent-chat-service";
import { db } from "@repo/api/tools/db";

import { currentUserId } from "~/app/api/documents/download";

async function requireUser() {
  const userId = await currentUserId();
  if (!userId) throw new Error("Not signed in");
  return userId;
}

/**
 * The user's live conversation with the profile agent and its messages,
 * for the page. A conversation already under way comes with a session
 * token and its stream cursor, so a reload reconnects to an answer still
 * being written.
 */
export async function loadProfileChat() {
  const current = await new AgentChatService(db).current(await requireUser());
  const session =
    current.messages.length > 0
      ? {
          publicAccessToken: await auth.createPublicToken({
            scopes: {
              read: { sessions: current.chatId },
              write: { sessions: current.chatId },
            },
            expirationTime: "1h",
          }),
          lastEventId: current.lastEventId,
        }
      : null;
  return { ...current, session };
}

/**
 * Starts (or resumes) the conversation's session on Trigger.dev, only for
 * its owner. The session gets a retention deadline: the session-create body
 * is the documented place for it, which the start action doesn't expose.
 */
export async function startProfileChatSession({ chatId }: { chatId: string }) {
  const owned = await new AgentChatService(db).requireOwn({
    userId: await requireUser(),
    chatId,
  });
  const start = chat.createStartSessionAction("profile_agent", {
    triggerConfig: { idleTimeoutInSeconds: 300 },
    fetch: (url, init, { endpoint }) => {
      if (endpoint !== "sessions" || typeof init.body !== "string") {
        return fetch(url, init);
      }
      const body = JSON.parse(init.body) as Record<string, unknown>;
      return fetch(url, {
        ...init,
        body: JSON.stringify({
          ...body,
          expiresAt: owned.expiresAt.toISOString(),
        }),
      });
    },
  });
  return start({ chatId });
}

/** A fresh session-scoped token, for the conversation's owner only. */
export async function mintProfileChatToken(chatId: string) {
  await new AgentChatService(db).requireOwn({
    userId: await requireUser(),
    chatId,
  });
  return auth.createPublicToken({
    scopes: { read: { sessions: chatId }, write: { sessions: chatId } },
    expirationTime: "1h",
  });
}
