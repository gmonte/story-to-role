"use client";

import { useState, type FormEvent } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { ArrowUp } from "lucide-react";

import type { ChatContext } from "@repo/api/domains/chat/schemas/chat-message";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import { Textarea } from "@repo/web/components/ui/textarea";
import { cn } from "@repo/web/lib/utils";

import { AiAtWork } from "~/domains/workspace/components/ai-at-work";
import { useTRPC } from "~/tools/trpc/client";

/**
 * The chat column of one context: its messages above, the composer below.
 * Each message starts a task; the panel follows the run live and reloads
 * the conversation when the reply is stored.
 */
export function ChatPanel({
  context,
  emptyHeading,
  emptyDescription,
}: {
  context: ChatContext;
  emptyHeading: string;
  emptyDescription: string;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [pendingTurn, setPendingTurn] = useState<RealtimeSubscription>();

  const messagesQuery = trpc.chat.messages.queryOptions({ context });
  const messages = useQuery(messagesQuery);

  const send = useMutation(
    trpc.chat.send.mutationOptions({
      onSuccess: ({ realtime }) => {
        setDraft("");
        setPendingTurn(realtime);
        void queryClient.invalidateQueries({
          queryKey: messagesQuery.queryKey,
        });
      },
      onError: (error) => toast.error(error.message),
    })
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || pendingTurn) return;
    send.mutate({ context, message: draft });
  }

  const hasMessages = (messages.data?.length ?? 0) > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {hasMessages ? (
          <ol className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
            {messages.data?.map((message) => (
              <li
                key={message.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                  message.author === "user" ? "bg-muted self-end" : "self-start"
                )}
              >
                {message.kind === "off_topic"
                  ? t.formatMessage({
                      defaultMessage:
                        "I can only help with your career here. Tell me about your positions, projects, achievements or goals.",
                    })
                  : message.content}
              </li>
            ))}
            {pendingTurn && (
              <PendingTurn
                key={pendingTurn.runId}
                {...pendingTurn}
                onDone={() => {
                  setPendingTurn(undefined);
                  void queryClient.invalidateQueries({
                    queryKey: messagesQuery.queryKey,
                  });
                }}
              />
            )}
          </ol>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              {emptyHeading}
            </h2>
            <p className="text-muted-foreground max-w-md text-sm">
              {emptyDescription}
            </p>
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="mx-auto w-full max-w-3xl p-4">
        <div className="bg-background relative rounded-xl border shadow-sm">
          <Textarea
            rows={2}
            value={draft}
            maxLength={8000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) onSubmit(event);
            }}
            placeholder={t.formatMessage({ defaultMessage: "Message" })}
            className="resize-none border-0 pr-12 shadow-none focus-visible:ring-0"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!draft.trim() || send.isPending || !!pendingTurn}
            className="absolute right-2 bottom-2 size-8 rounded-full"
            aria-label={t.formatMessage({ defaultMessage: "Send" })}
          >
            <ArrowUp />
          </Button>
        </div>
      </form>
    </div>
  );
}

function PendingTurn({
  runId,
  accessToken,
  onDone,
}: RealtimeSubscription & { onDone: () => void }) {
  const t = useTranslation();

  useRealtimeRun(runId, {
    accessToken,
    onComplete: () => onDone(),
  });

  return (
    <li className="self-start">
      <AiAtWork title={t.formatMessage({ defaultMessage: "Thinking" })} />
    </li>
  );
}
