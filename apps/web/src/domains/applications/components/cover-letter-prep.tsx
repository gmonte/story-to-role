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
import type { OutputLanguage } from "@repo/api/domains/documents/schemas/document";
import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";

import { VoiceInputButton } from "~/domains/career/components/voice-input-button";
import { CoverLetterEditor } from "~/domains/documents/components/cover-letter-editor";
import { GenerateLetterDialog } from "~/domains/documents/components/generate-letter-dialog";
import { useOpeningDocuments } from "~/domains/documents/hooks/use-opening-documents";
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
export function CoverLetterPrep({
  openingId,
  defaultLanguage,
  defaultTone,
}: {
  openingId: string;
  defaultLanguage: OutputLanguage;
  defaultTone: Tone;
}) {
  const trpc = useTRPC();
  const motivation = useQuery({
    ...trpc.motivation.get.queryOptions({ openingId }),
    refetchInterval: (query) => (query.state.data?.thinking ? 1500 : false),
  });
  const documents = useOpeningDocuments(openingId);
  const data = motivation.data;
  if (!data) return null;
  const letter = documents.data?.documents.find(
    (document) => document.kind === "cover_letter"
  );
  const resumeVersions =
    documents.data?.documents.find((document) => document.kind === "resume")
      ?.versions ?? [];
  const generating =
    letter?.generation?.status === "pending" ||
    letter?.generation?.status === "running";
  const writeLetter = (
    <WriteLetter
      openingId={openingId}
      generating={generating}
      failed={letter?.generation?.status === "failed"}
      resumeVersions={resumeVersions}
      defaultLanguage={defaultLanguage}
      defaultTone={defaultTone}
    />
  );
  // The interview done or skipped and a letter written: the letter.
  if (
    letter?.versions.length &&
    (data.status === "finished" || data.status === "skipped")
  ) {
    return (
      <CoverLetterEditor
        openingId={openingId}
        document={letter}
        resumeVersions={resumeVersions}
        defaultTone={defaultTone}
      />
    );
  }
  if (!data.status || data.status === "failed") {
    return (
      <StoryChoice openingId={openingId} failed={data.status === "failed"} />
    );
  }
  if (data.status === "skipped") {
    return (
      <div className="flex flex-col gap-4">
        <Skipped openingId={openingId} />
        {writeLetter}
      </div>
    );
  }
  if (data.status === "in_progress") {
    return <Interview openingId={openingId} motivation={data} />;
  }
  return (
    <div className="flex flex-col gap-6">
      <PointsReview
        key={data.points.map((point) => `${point.id}:${point.status}`).join()}
        openingId={openingId}
        motivation={data}
      />
      {!data.points.some((point) => point.status === "draft") && writeLetter}
    </div>
  );
}

/** The step after the interview: writing the letter itself. */
function WriteLetter({
  openingId,
  generating,
  failed,
  resumeVersions,
  defaultLanguage,
  defaultTone,
}: {
  openingId: string;
  generating: boolean;
  failed: boolean;
  resumeVersions: VersionView[];
  defaultLanguage: OutputLanguage;
  defaultTone: Tone;
}) {
  const t = useTranslation();
  if (generating) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" />
        {t.formatMessage({ defaultMessage: "Writing the cover letter…" })}
      </p>
    );
  }
  return (
    <section className="flex flex-col items-start gap-2">
      {failed && (
        <p className="text-xs text-red-600">
          {t.formatMessage({
            defaultMessage: "The last letter failed. Try again.",
          })}
        </p>
      )}
      <GenerateLetterDialog
        openingId={openingId}
        resumeVersions={resumeVersions}
        defaultLanguage={defaultLanguage}
        defaultTone={defaultTone}
        trigger={
          <Button>
            {t.formatMessage({ defaultMessage: "Generate cover letter" })}
          </Button>
        }
      />
    </section>
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
  // The closest story comes chosen; the user may pick another.
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const storyId =
    picked === undefined ? (choices.data?.[0]?.storyId ?? null) : picked;
  const setStoryId = (id: string) => setPicked(id);
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
            <span className="text-muted-foreground text-xs">
              {choice.fits.length > 0
                ? t.formatMessage(
                    { defaultMessage: "Fits: {requirements}" },
                    { requirements: choice.fits.join(", ") }
                  )
                : t.formatMessage({
                    defaultMessage:
                      "Its evidence is among the closest to this opening.",
                  })}
            </span>
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
          onClick={() => skip.mutate({ openingId, storyId })}
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
            <span className="whitespace-pre-wrap"> {turn.text}</span>
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
      {!motivation.thinking && !answer.isPending && (
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
