"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";

import type { MotivationView } from "@repo/api/domains/applications/schemas/motivation";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
import { toast } from "@repo/web/components/ui/sonner";
import { Textarea } from "@repo/web/components/ui/textarea";
import { cn } from "@repo/web/lib/utils";

import { VoiceInputButton } from "~/domains/career/components/voice-input-button";
import { useTimeline } from "~/domains/career/hooks/use-career-queries";
import { useTRPC } from "~/tools/trpc/client";

function useRefreshMotivation() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({
      queryKey: trpc.motivation.pathKey(),
    });
  };
}

/**
 * Before a cover letter (resume spec, "Cover letter inputs"): the story it
 * will tell, chosen among the closest approved stories, and a short
 * motivation interview whose points stay here or, approved one by one,
 * become career goals or story details.
 */
export function CoverLetterPrep({ openingId }: { openingId: string }) {
  const trpc = useTRPC();
  const motivation = useQuery({
    ...trpc.motivation.get.queryOptions({ openingId }),
    refetchInterval: (query) => (query.state.data?.thinking ? 1500 : false),
  });
  const data = motivation.data;
  if (!data) return null;

  if (!data.status || data.status === "failed") {
    return (
      <StoryChoice openingId={openingId} failed={data.status === "failed"} />
    );
  }
  if (data.status === "skipped") {
    return <Skipped openingId={openingId} />;
  }
  if (data.status === "in_progress") {
    return <Interview openingId={openingId} motivation={data} />;
  }
  return (
    <PointsReview
      key={data.points.map((point) => `${point.id}:${point.status}`).join()}
      openingId={openingId}
      motivation={data}
    />
  );
}

function StoryChoice({
  openingId,
  failed,
}: {
  openingId: string;
  failed: boolean;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshMotivation();
  const choices = useQuery(
    trpc.motivation.storyChoices.queryOptions({ openingId })
  );
  const [storyId, setStoryId] = useState<string | null>(null);
  const onError = (error: { message: string }) => toast.error(error.message);
  const start = useMutation(
    trpc.motivation.start.mutationOptions({ onSuccess: refresh, onError })
  );
  const skip = useMutation(
    trpc.motivation.skip.mutationOptions({ onSuccess: refresh, onError })
  );

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="font-medium">
          {t.formatMessage({ defaultMessage: "The story your letter tells" })}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t.formatMessage({
            defaultMessage:
              "A cover letter is built around one convincing story. These are your approved stories closest to this opening.",
          })}
        </p>
      </div>
      {failed && (
        <p className="text-xs text-red-600">
          {t.formatMessage({
            defaultMessage:
              "The interview stopped on an error. Start it again.",
          })}
        </p>
      )}
      <div className="grid gap-2">
        {choices.data?.map((choice) => (
          <button
            key={choice.storyId}
            type="button"
            onClick={() => setStoryId(choice.storyId)}
            className={cn(
              "bg-background flex flex-col gap-1 rounded-lg border p-3 text-left text-sm",
              storyId === choice.storyId && "border-primary"
            )}
          >
            <span className="font-medium">{choice.problem}</span>
            <span>{choice.result}</span>
            {choice.position && (
              <span className="text-muted-foreground text-xs">
                {choice.position}
              </span>
            )}
            {choice.fits.length > 0 && (
              <span className="text-muted-foreground text-xs">
                {t.formatMessage(
                  { defaultMessage: "Fits: {requirements}" },
                  { requirements: choice.fits.join(", ") }
                )}
              </span>
            )}
          </button>
        ))}
        {choices.data?.length === 0 && (
          <p className="text-muted-foreground text-sm">
            {t.formatMessage({
              defaultMessage:
                "No approved stories yet. The interview can still collect your motivation.",
            })}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          disabled={start.isPending}
          onClick={() => start.mutate({ openingId, storyId })}
        >
          {t.formatMessage({
            defaultMessage: "Start the motivation interview",
          })}
        </Button>
        <Button
          variant="ghost"
          disabled={skip.isPending}
          onClick={() => skip.mutate({ openingId })}
        >
          {t.formatMessage({ defaultMessage: "Skip it" })}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {t.formatMessage({
          defaultMessage:
            "Three to five short questions about why you want this opening, by voice or text.",
        })}
      </p>
    </section>
  );
}

function Skipped({ openingId }: { openingId: string }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshMotivation();
  const start = useMutation(
    trpc.motivation.start.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );
  return (
    <section className="flex flex-col items-start gap-2">
      <p className="text-sm">
        {t.formatMessage({
          defaultMessage:
            "Motivation interview skipped. The letter will be marked “could improve with your motivation”.",
        })}
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={start.isPending}
        onClick={() => start.mutate({ openingId, storyId: null })}
      >
        {t.formatMessage({ defaultMessage: "Do the interview" })}
      </Button>
    </section>
  );
}

function Interview({
  openingId,
  motivation,
}: {
  openingId: string;
  motivation: MotivationView;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshMotivation();
  const timeline = useTimeline();
  const [text, setText] = useState("");
  const answer = useMutation(
    trpc.motivation.answer.mutationOptions({
      onSuccess: async () => {
        setText("");
        await refresh();
      },
      onError: (error) => toast.error(error.message),
    })
  );
  const send = () => text.trim() && answer.mutate({ openingId, text });

  return (
    <section className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {motivation.turns.map((turn, index) => (
          <li
            key={index}
            className={cn(
              "max-w-[85%] rounded-lg p-2.5 text-sm",
              turn.role === "answer"
                ? "bg-primary text-primary-foreground self-end"
                : "bg-muted self-start"
            )}
          >
            {turn.role === "steer" && (
              <span className="text-muted-foreground block text-xs">
                {t.formatMessage({
                  defaultMessage:
                    "Let's keep to this opening and why you want it.",
                })}
              </span>
            )}
            {turn.text}
          </li>
        ))}
        {motivation.thinking && (
          <li className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="size-3.5 animate-spin" />
            {t.formatMessage({
              defaultMessage: "Thinking of the next question…",
            })}
          </li>
        )}
      </ul>
      {!motivation.thinking && (
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={2000}
            rows={2}
            placeholder={t.formatMessage({ defaultMessage: "Your answer" })}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
          />
          <VoiceInputButton
            language={timeline.data?.profile.interviewLanguage ?? "en-US"}
            onTranscript={(spoken) =>
              setText((current) => (current ? `${current} ${spoken}` : spoken))
            }
          />
          <Button
            size="icon"
            disabled={answer.isPending || !text.trim()}
            onClick={send}
            aria-label={t.formatMessage({ defaultMessage: "Send" })}
          >
            <Send />
          </Button>
        </div>
      )}
    </section>
  );
}

function PointsReview({
  openingId,
  motivation,
}: {
  openingId: string;
  motivation: MotivationView;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshMotivation();
  const drafts = motivation.points.filter((point) => point.status === "draft");
  const [saved, setSaved] = useState(
    drafts.filter((point) => point.suggested).map((point) => point.id)
  );
  const onError = (error: { message: string }) => toast.error(error.message);
  const confirm = useMutation(
    trpc.motivation.confirm.mutationOptions({ onSuccess: refresh, onError })
  );
  const start = useMutation(
    trpc.motivation.start.mutationOptions({ onSuccess: refresh, onError })
  );

  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-medium">
        {t.formatMessage({ defaultMessage: "What you told the interview" })}
      </h3>
      <ul className="flex flex-col gap-2">
        {motivation.points.map((point) => (
          <li
            key={point.id}
            className="bg-background flex flex-col gap-1.5 rounded-lg border p-2.5 text-sm"
          >
            <span>{point.text}</span>
            {point.status === "draft" ? (
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={saved.includes(point.id)}
                  onCheckedChange={(checked) =>
                    setSaved(
                      checked
                        ? [...saved, point.id]
                        : saved.filter((id) => id !== point.id)
                    )
                  }
                />
                {point.kind === "goal"
                  ? t.formatMessage({
                      defaultMessage:
                        "Save as a career goal, so later letters ask less",
                    })
                  : t.formatMessage({
                      defaultMessage: "Add this detail to the story",
                    })}
              </label>
            ) : (
              <span className="text-muted-foreground text-xs">
                {point.status === "promoted"
                  ? point.kind === "goal"
                    ? t.formatMessage({
                        defaultMessage: "Saved as a career goal",
                      })
                    : t.formatMessage({ defaultMessage: "Added to the story" })
                  : t.formatMessage({ defaultMessage: "For this application" })}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        {drafts.length > 0 && (
          <Button
            disabled={confirm.isPending}
            onClick={() =>
              confirm.mutate({
                openingId,
                decisions: drafts.map((point) => ({
                  motivationPointId: point.id,
                  save: saved.includes(point.id),
                })),
              })
            }
          >
            {t.formatMessage({ defaultMessage: "Confirm points" })}
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={start.isPending}
          onClick={() =>
            start.mutate({ openingId, storyId: motivation.storyId })
          }
        >
          {t.formatMessage({ defaultMessage: "Start over" })}
        </Button>
      </div>
    </section>
  );
}
