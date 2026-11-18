"use client";

import { useEffect, useState } from "react";

import { useChat } from "@ai-sdk/react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { AnyTask, TaskIdentifier } from "@trigger.dev/sdk";
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react";
import type { ChatInit, UIMessage } from "ai";

import type { AgentChatSubject } from "@repo/api/domains/agents/agent-chat-repository";
import { agentSettings } from "@repo/api/domains/agents/agent-settings";

import {
  mintAgentChatToken,
  recoverAgentChatRun,
  startAgentChatSession,
  startNewAgentChat,
} from "../actions/agent-chat-actions";
import { useAnswerWatchdog } from "./use-answer-watchdog";

export type ChatSession = { publicAccessToken: string; lastEventId?: string };

/** What `loadAgentChat` returns, as the page's query keeps it. */
export type LoadedAgentChat = {
  chatId: string;
  messages: UIMessage[];
  session: ChatSession | null;
  // A chat that replaced another takes the focus: the user was typing.
  replaced?: boolean;
};

/**
 * One conversation with an agent, as every agent's panel runs it (ADR
 * 0007, ADR 0009): the transport to its Trigger.dev session, the chat, the
 * watchdog that recovers an answer that never starts, and New
 * conversation. The agent's own callbacks (what to refresh on a data part,
 * on finish) and its composer stay with the agent.
 */
export function useAgentChat<TTask extends AnyTask>({
  task,
  subject,
  queryKey,
  chatId,
  initialMessages,
  session,
  onData,
  onFinish,
}: {
  task: TaskIdentifier<TTask>;
  subject: AgentChatSubject;
  // The query `loadAgentChat` fills, replaced when a new conversation starts.
  queryKey: QueryKey;
  chatId: string;
  initialMessages: UIMessage[];
  session: ChatSession | null;
  onData?: ChatInit<UIMessage>["onData"];
  onFinish?: ChatInit<UIMessage>["onFinish"];
}) {
  const queryClient = useQueryClient();
  const transport = useTriggerChatTransport<TTask>({
    task,
    accessToken: (current) => mintAgentChatToken(current.chatId),
    startSession: (current) =>
      startAgentChatSession({ chatId: current.chatId }),
    // A session under way: reconnect to it instead of starting one.
    sessions: session ? { [chatId]: session } : undefined,
  });
  const chat = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    resume: initialMessages.length > 0,
    onData,
    onFinish,
  });
  const { status, stop, regenerate, setMessages, messages } = chat;
  const busy = status === "submitted" || status === "streaming";

  // An answer that never starts (the run holding the session died, say):
  // the run is cancelled and the same message goes again, once; if that is
  // not answered either, the user is asked instead of looping.
  const resend = async () => {
    await recoverAgentChatRun({ chatId });
    await stop();
    // Same message, same id: the agent doesn't take it twice.
    await regenerate();
  };
  const watchdog = useAnswerWatchdog({
    status,
    timeoutMs: agentSettings.answerStartTimeoutMs,
    recover: resend,
  });
  const failed = watchdog.phase === "failed";
  useEffect(() => {
    if (failed) void stop();
  }, [failed, stop]);

  // The conversation's messages are deleted; the new chat's id remounts
  // the conversation, so its messages, composer and transport start over.
  const [startingNew, setStartingNew] = useState(false);
  async function startNew(reset: () => void) {
    // Optimistic: the conversation empties at once; the new chat's id comes
    // right after and remounts it.
    const previous = messages;
    setStartingNew(true);
    setMessages([]);
    reset();
    try {
      await stop();
      const fresh = await startNewAgentChat(subject);
      queryClient.setQueryData<LoadedAgentChat>(queryKey, {
        ...fresh,
        replaced: true,
      });
    } catch (error) {
      setMessages(previous);
      throw error;
    } finally {
      setStartingNew(false);
    }
  }

  const last = messages.at(-1);
  const streamingText =
    status === "streaming" &&
    last?.role === "assistant" &&
    last.parts.at(-1)?.type === "text";

  return {
    ...chat,
    busy,
    failed,
    watchdog,
    resend,
    startNew,
    startingNew,
    last,
    streamingText,
  };
}
