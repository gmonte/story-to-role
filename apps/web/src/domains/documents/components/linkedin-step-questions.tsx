"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  MessageCircleQuestion,
  RotateCcw,
  Send,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import { Textarea } from "@repo/web/components/ui/textarea";
import { cn } from "@repo/web/lib/utils";

import { VoiceInputButton } from "~/domains/career/components/voice-input-button";
import { useTimeline } from "~/domains/career/hooks/use-career-queries";
import { CreditCost } from "~/domains/credits/components/credit-cost";
import { useCredits } from "~/domains/credits/hooks/use-credits";
import { AiAtWork } from "~/domains/workspace/components/ai-at-work";
import { useTRPC } from "~/tools/trpc/client";

/**
 * A LinkedIn step's questions (resume spec, "LinkedIn", "Step by step"):
 * up to three short questions about what the profile lacks for the
 * section, by voice or text, each priced like the motivation interview's
 * and skippable; what the user answered is listed, removable, and the
 * writer cites it.
 */
export function LinkedinStepQuestions({
  versionId,
  section,
  disabled,
}: {
  versionId: string;
  section: string;
  /** A generation is running or edits are unsaved. */
  disabled: boolean;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const credits = useCredits();
  const timeline = useTimeline();
  const [text, setText] = useState("");
  const interview = useQuery({
    ...trpc.linkedinInterview.get.queryOptions({ versionId, section }),
    refetchInterval: (query) => (query.state.data?.thinking ? 1500 : false),
  });
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.linkedinInterview.pathKey(),
    });
  const onError = (error: { message: string }) => toast.error(error.message);
  const start = useMutation(
    trpc.linkedinInterview.start.mutationOptions({
      onSuccess: refresh,
      onError,
    })
  );
  const answer = useMutation(
    trpc.linkedinInterview.answer.mutationOptions({
      onSuccess: async () => {
        setText("");
        await refresh();
      },
      onError,
    })
  );
  const skip = useMutation(
    trpc.linkedinInterview.skip.mutationOptions({
      onSuccess: refresh,
      onError,
    })
  );
  const remove = useMutation(
    trpc.linkedinInterview.removeInstruction.mutationOptions({
      onSuccess: refresh,
      onError,
    })
  );
  const send = useMutation(
    trpc.linkedinInterview.sendToProfile.mutationOptions({
      onSuccess: async () => {
        toast.success(
          t.formatMessage({
            defaultMessage:
              "Sent to your profile as a suggestion. Accept it in My career and publish to use it in your resumes.",
          })
        );
        await refresh();
      },
      onError,
    })
  );
  const data = interview.data;
  if (!data) return null;
  const asking = data.status === "in_progress";
  const sendAnswer = () =>
    data.interviewId &&
    text.trim() &&
    answer.mutate({ interviewId: data.interviewId, text });

  return (
    <div className="flex flex-col gap-2">
      {asking ? (
        <>
          <ul className="flex flex-col gap-1.5">
            {data.turns.map((turn, index) => (
              <li
                key={index}
                className={cn(
                  "max-w-[90%] rounded-lg p-2 text-sm whitespace-pre-wrap",
                  turn.role === "answer"
                    ? "bg-primary text-primary-foreground self-end"
                    : "bg-muted self-start"
                )}
              >
                {turn.text}
              </li>
            ))}
            {data.thinking && (
              <li>
                <AiAtWork
                  title={t.formatMessage({
                    defaultMessage: "Reading your profile for this section",
                  })}
                />
              </li>
            )}
          </ul>
          {!data.thinking && !answer.isPending && (
            <div className="flex items-end gap-1.5">
              <Textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={2000}
                rows={2}
                placeholder={t.formatMessage({
                  defaultMessage: "Your answer",
                })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendAnswer();
                  }
                }}
              />
              <VoiceInputButton
                language={timeline.data?.profile.interviewLanguage ?? "en-US"}
                value={text}
                onValueChange={setText}
              />
              <Button
                size="icon"
                disabled={!text.trim()}
                onClick={sendAnswer}
                aria-label={t.formatMessage({ defaultMessage: "Send" })}
              >
                <Send />
              </Button>
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            disabled={skip.isPending}
            onClick={() =>
              data.interviewId && skip.mutate({ interviewId: data.interviewId })
            }
          >
            {t.formatMessage({ defaultMessage: "Skip the questions" })}
          </Button>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || start.isPending}
            onClick={() => start.mutate({ versionId, section })}
          >
            {data.status ? <RotateCcw /> : <MessageCircleQuestion />}
            {data.status
              ? t.formatMessage({ defaultMessage: "Answer more questions" })
              : t.formatMessage({ defaultMessage: "Answer a few questions" })}
          </Button>
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <CreditCost credits={credits.data?.estimates.motivationTurn} />
            {t.formatMessage({ defaultMessage: "per question" })}
          </span>
        </div>
      )}
      {data.status === "failed" && (
        <p className="text-destructive text-xs">
          {t.formatMessage({
            defaultMessage: "The questions stopped. Try again.",
          })}
        </p>
      )}
      {data.instructions.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs font-medium">
            {t.formatMessage({
              defaultMessage: "Your answers for this section",
            })}
          </p>
          <ul className="flex flex-col gap-1">
            {data.instructions.map((instruction) => (
              <li
                key={instruction.id}
                className="bg-muted/60 flex items-start gap-1 rounded-md px-2 py-1 text-xs"
              >
                <span className="flex-1">{instruction.text}</span>
                {instruction.sent ? (
                  <Link
                    href="/app/career"
                    className="text-primary flex shrink-0 items-center gap-0.5 hover:underline"
                  >
                    <Check className="size-3" />
                    {t.formatMessage({ defaultMessage: "In your profile" })}
                  </Link>
                ) : (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-5 shrink-0"
                    disabled={send.isPending}
                    title={t.formatMessage({
                      defaultMessage: "Send to my profile",
                    })}
                    aria-label={t.formatMessage({
                      defaultMessage: "Send to my profile",
                    })}
                    onClick={() =>
                      send.mutate({ linkedinInstructionId: instruction.id })
                    }
                  >
                    <UserPlus className="size-3" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-5 shrink-0"
                  disabled={remove.isPending}
                  aria-label={t.formatMessage({ defaultMessage: "Remove" })}
                  onClick={() =>
                    remove.mutate({ linkedinInstructionId: instruction.id })
                  }
                >
                  <X className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
