"use client";

import { useEffect, useState, type ReactNode } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";

import type { MotivationView } from "@repo/api/domains/applications/schemas/motivation";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/web/components/ui/collapsible";
import { toast } from "@repo/web/components/ui/sonner";
import { Textarea } from "@repo/web/components/ui/textarea";
import { cn } from "@repo/web/lib/utils";
import type { OutputLanguage } from "@repo/api/domains/documents/schemas/document";
import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";

import { AiAtWork } from "~/domains/workspace/components/ai-at-work";
import { VoiceInputButton } from "~/domains/career/components/voice-input-button";
import { DocumentAgent } from "~/domains/documents/components/document-agent";
import { CoverLetterWorkspace } from "~/domains/documents/components/cover-letter-workspace";
import {
  chosenStory,
  LetterStoryPicker,
  useLetterStories,
} from "~/domains/documents/components/letter-story-picker";
import { GenerateLetterNow } from "~/domains/documents/components/generate-letter-dialog";
import { useOpeningDocuments } from "~/domains/documents/hooks/use-opening-documents";
import { useTimeline } from "~/domains/career/hooks/use-career-queries";
import { useTRPC } from "~/tools/trpc/client";
import { ResizableAside } from "~/domains/workspace/components/resizable-aside";

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
 * Before a cover letter (resume spec, "Cover letter inputs"): a short
 * motivation interview whose points stay here or, approved one by one,
 * become suggestions for your profile.
 */
export function CoverLetterPrep({
  openingId,
  defaultLanguage,
  defaultTone,
  aside,
}: {
  openingId: string;
  defaultLanguage: OutputLanguage;
  defaultTone: Tone;
  /** The left column beside the steps (the page's context), as the
   * document workspace has its index there. */
  aside?: ReactNode;
}) {
  const trpc = useTRPC();
  const motivation = useQuery({
    ...trpc.motivation.get.queryOptions({ openingId }),
    refetchInterval: (query) => (query.state.data?.thinking ? 1500 : false),
  });
  const documents = useOpeningDocuments(openingId);
  // The motivation answer being written: the agent may fill it.
  const [answerText, setAnswerText] = useState("");
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
    return <CoverLetterWorkspace document={letter} aside={aside} />;
  }
  const agent = (
    <LetterPrepAgent
      openingId={openingId}
      onUseAnswer={
        data.status === "in_progress" && !data.thinking
          ? setAnswerText
          : undefined
      }
    />
  );
  if (!data.status || data.status === "failed") {
    return (
      <Prep aside={aside} agent={agent}>
        <MotivationStart
          openingId={openingId}
          failed={data.status === "failed"}
        />
      </Prep>
    );
  }
  if (data.status === "skipped") {
    return (
      <Prep aside={aside} agent={agent}>
        <div className="flex flex-col gap-4">
          <Skipped openingId={openingId} />
          {writeLetter}
        </div>
      </Prep>
    );
  }
  if (data.status === "in_progress") {
    return (
      <Prep aside={aside} agent={agent}>
        <Interview
          openingId={openingId}
          motivation={data}
          text={answerText}
          setText={setAnswerText}
        />
      </Prep>
    );
  }
  const review = (
    <PointsReview
      key={data.points.map((point) => `${point.id}:${point.status}`).join()}
      openingId={openingId}
      motivation={data}
    />
  );
  // Points left to confirm come first; once confirmed the interview is over
  // and writing the letter is the step (owner), the interview folded away.
  if (data.points.some((point) => point.status === "draft")) {
    return (
      <Prep aside={aside} agent={agent}>
        {review}
      </Prep>
    );
  }
  return (
    <Prep aside={aside} agent={agent}>
      <InterviewDone points={data.points.length} writeLetter={writeLetter}>
        {review}
      </InterviewDone>
    </Prep>
  );
}

/** The interview over: the letter to write, the interview a click away. */
function InterviewDone({
  points,
  writeLetter,
  children,
}: {
  points: number;
  writeLetter: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <section className="bg-card flex flex-col gap-3 rounded-lg border p-5">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-4 text-emerald-600" />
            {t.formatMessage({ defaultMessage: "Your interview is done" })}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t.formatMessage(
              {
                defaultMessage:
                  "{count, plural, =0 {Nothing you told it} one {The # point you told it} other {The # points you told it}} go into the letter, with your profile and the company facts you picked.",
              },
              { count: points }
            )}
          </p>
        </div>
        {writeLetter}
      </section>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="self-start">
            <ChevronRight
              className={cn("transition-transform", open && "rotate-90")}
            />
            {t.formatMessage({ defaultMessage: "Review the interview" })}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/**
 * The steps before the letter, read in the column's width, in the same
 * three zones as the document workspace so the page doesn't jump.
 */
function Prep({
  children,
  aside,
  agent,
}: {
  children: ReactNode;
  aside?: ReactNode;
  /** The cover letter's agent, in the right column. */
  agent?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1">
      {aside && (
        <ResizableAside
          storageKey="document-index-width"
          className="space-y-6 p-4"
        >
          {aside}
        </ResizableAside>
      )}
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl p-6">{children}</div>
      </div>
      {agent && (
        <ResizableAside
          storageKey="letter-agent-width"
          defaultWidth={384}
          side="right"
          from="lg"
        >
          {agent}
        </ResizableAside>
      )}
    </div>
  );
}

/**
 * The cover letter's agent while the letter is prepared: the letter's
 * document is made empty so the agent has its conversation, which goes on
 * beside the letter once it is generated.
 */
function LetterPrepAgent({
  openingId,
  onUseAnswer,
}: {
  openingId: string;
  onUseAnswer?: (text: string) => void;
}) {
  const trpc = useTRPC();
  const document = useMutation(
    trpc.documents.letterAgentDocument.mutationOptions()
  );
  const { mutate } = document;
  useEffect(() => {
    mutate({ openingId });
  }, [mutate, openingId]);
  if (!document.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }
  return (
    <DocumentAgent
      documentId={document.data.documentId}
      kind="cover_letter"
      version={null}
      onUseAnswer={onUseAnswer}
    />
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
      <AiAtWork
        title={t.formatMessage({
          defaultMessage: "Writing your cover letter from your story",
        })}
      />
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
      <GenerateLetterNow
        openingId={openingId}
        resumeVersions={resumeVersions}
        defaultLanguage={defaultLanguage}
        defaultTone={defaultTone}
      />
    </section>
  );
}

function MotivationStart({
  openingId,
  failed,
}: {
  openingId: string;
  failed: boolean;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshMotivation();
  const onError = (error: { message: string }) => toast.error(error.message);
  const stories = useLetterStories(openingId);
  const [pickedStory, setPickedStory] = useState<string | null>(null);
  const start = useMutation(
    trpc.motivation.start.mutationOptions({ onSuccess: refresh, onError })
  );
  const skip = useMutation(
    trpc.motivation.skip.mutationOptions({ onSuccess: refresh, onError })
  );

  return (
    <section className="flex flex-col gap-3">
      {failed && (
        <p className="text-xs text-red-600">
          {t.formatMessage({
            defaultMessage:
              "The interview stopped on an error. Start it again.",
          })}
        </p>
      )}
      <p className="text-muted-foreground text-sm">
        {t.formatMessage({
          defaultMessage:
            "Three to five short questions about why you want this opening, by voice or text.",
        })}
      </p>
      {stories.data && stories.data.length > 0 && (
        <div className="grid gap-1.5">
          <p className="text-sm font-medium">
            {t.formatMessage({
              defaultMessage: "The story the letter will tell",
            })}
          </p>
          <LetterStoryPicker
            stories={stories.data}
            value={pickedStory}
            onChange={setPickedStory}
          />
        </div>
      )}
      <div className="flex gap-2">
        <Button
          disabled={start.isPending}
          onClick={() =>
            start.mutate({
              openingId,
              storyLineId: chosenStory(stories.data, pickedStory) ?? undefined,
            })
          }
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
        onClick={() => start.mutate({ openingId })}
      >
        {t.formatMessage({ defaultMessage: "Do the interview" })}
      </Button>
    </section>
  );
}

function Interview({
  openingId,
  motivation,
  text,
  setText,
}: {
  openingId: string;
  motivation: MotivationView;
  text: string;
  setText: (text: string) => void;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshMotivation();
  const timeline = useTimeline();
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
          <li>
            <AiAtWork
              title={t.formatMessage({
                defaultMessage: "Thinking of the next question",
              })}
            />
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
            value={text}
            onValueChange={setText}
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
  const router = useRouter();
  const refresh = useRefreshMotivation();
  const drafts = motivation.points.filter((point) => point.status === "draft");
  const [saved, setSaved] = useState(
    drafts.filter((point) => point.suggested).map((point) => point.id)
  );
  const onError = (error: { message: string }) => toast.error(error.message);
  const confirm = useMutation(
    trpc.motivation.confirm.mutationOptions({
      onSuccess: async (result) => {
        await refresh();
        if (result.sent.length === 0) return;
        toast.success(
          t.formatMessage(
            {
              defaultMessage:
                "{count, plural, =0 {No suggestion} one {# suggestion waits} other {# suggestions wait}} for you in My career.",
            },
            { count: result.sent.length }
          ),
          {
            action: {
              label: t.formatMessage({ defaultMessage: "Open My career" }),
              onClick: () => router.push("/app/career"),
            },
          }
        );
      },
      onError,
    })
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
            className="bg-card flex flex-col gap-1.5 rounded-lg border p-2.5 text-sm"
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
                        "Suggest it for the career direction in your profile",
                    })
                  : t.formatMessage({
                      defaultMessage:
                        "Suggest this detail for the story’s experience in your profile",
                    })}
              </label>
            ) : (
              <span className="text-muted-foreground text-xs">
                {point.status === "promoted"
                  ? point.kind === "goal"
                    ? t.formatMessage({
                        defaultMessage:
                          "Suggested for the career direction in your profile",
                      })
                    : t.formatMessage({
                        defaultMessage:
                          "Suggested for the story’s experience in your profile",
                      })
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
          onClick={() => start.mutate({ openingId })}
        >
          {t.formatMessage({ defaultMessage: "Start over" })}
        </Button>
      </div>
    </section>
  );
}
