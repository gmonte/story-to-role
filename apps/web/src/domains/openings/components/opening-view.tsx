"use client";

import { useEffect, useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";

import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import { Textarea } from "@repo/web/components/ui/textarea";

import { useTRPC } from "~/tools/trpc/client";

import { useOpening, useRefreshOpenings } from "../hooks/use-opening";
import { useOpeningLabels } from "../hooks/use-opening-labels";

/** The opening itself: its status, description and the gap questions. */
export function OpeningView({ openingId }: { openingId: string }) {
  const t = useTranslation();
  const labels = useOpeningLabels();
  const trpc = useTRPC();
  const refresh = useRefreshOpenings();
  const opening = useOpening(openingId);
  const setClosed = useMutation(
    trpc.openings.setClosed.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );

  // The sidebar's list learns the title once the analysis ends.
  const status = opening.data?.status;
  useEffect(() => {
    if (status && status !== "processing") void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (!opening.data) return null;
  const data = opening.data;

  if (data.status === "processing") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
        <p className="text-muted-foreground text-sm">
          {t.formatMessage({
            defaultMessage: "Reading the opening and checking your fit…",
          })}
        </p>
      </div>
    );
  }

  const gaps = data.fitCheck?.items.filter((item) => item.gapQuestion) ?? [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              {data.title ?? t.formatMessage({ defaultMessage: "Opening" })}
            </h2>
            <p className="text-muted-foreground text-sm">{data.company}</p>
          </div>
          <div className="flex items-center gap-2">
            {data.kind === "unsolicited" && (
              <Badge variant="outline">
                {t.formatMessage({ defaultMessage: "No vacancy" })}
              </Badge>
            )}
            {data.suggestedTone && (
              <Badge variant="secondary">
                {t.formatMessage(
                  { defaultMessage: "Suggested tone: {tone}" },
                  { tone: labels.tone(data.suggestedTone) }
                )}
              </Badge>
            )}
            {(data.status === "analyzed" || data.status === "closed") && (
              <Button
                size="sm"
                variant="outline"
                disabled={setClosed.isPending}
                onClick={() =>
                  setClosed.mutate({
                    openingId,
                    closed: data.status !== "closed",
                  })
                }
              >
                {data.status === "closed"
                  ? t.formatMessage({ defaultMessage: "Reopen" })
                  : t.formatMessage({ defaultMessage: "Close" })}
              </Button>
            )}
          </div>
        </div>

        {data.status === "rejected" && (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <p>{labels.rejection(data.rejectionReason)}</p>
            <Button asChild size="sm" variant="outline" className="self-start">
              <Link href="/app/openings/new">
                {t.formatMessage({ defaultMessage: "Add it again" })}
              </Link>
            </Button>
          </div>
        )}

        {gaps.length > 0 && (
          <section className="flex flex-col gap-3">
            <div>
              <h3 className="font-medium">
                {t.formatMessage({
                  defaultMessage: "Before writing for this opening",
                })}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t.formatMessage({
                  defaultMessage:
                    "The opening asks for things your evidence doesn't show yet. Tell us if you really lack them, or share a story.",
                })}
              </p>
            </div>
            {gaps.map((item) => (
              <GapQuestion
                key={item.id}
                fitCheckItemId={item.id}
                question={item.gapQuestion ?? ""}
                answer={item.gapAnswer}
              />
            ))}
          </section>
        )}

        {data.sourceUrl && (
          <a
            href={data.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground inline-flex items-center gap-1 text-sm underline"
          >
            <ExternalLink className="size-3.5" />
            {t.formatMessage({ defaultMessage: "Original posting" })}
          </a>
        )}

        {(data.description ?? data.notes) && (
          <section className="flex flex-col gap-2">
            <h3 className="font-medium">
              {data.description
                ? t.formatMessage({ defaultMessage: "Description" })
                : t.formatMessage({ defaultMessage: "Notes" })}
            </h3>
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">
              {data.description ?? data.notes}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function GapQuestion({
  fitCheckItemId,
  question,
  answer,
}: {
  fitCheckItemId: string;
  question: string;
  answer: string | null;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshOpenings();
  const [draft, setDraft] = useState(answer ?? "");
  const save = useMutation(
    trpc.openings.answerGapQuestion.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(
          t.formatMessage({ defaultMessage: "Answer saved for this opening." })
        );
      },
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-sm">{question}</p>
      <Textarea
        rows={2}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t.formatMessage({
          defaultMessage: "Your answer, or “I don't have it”",
        })}
      />
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        disabled={!draft.trim() || save.isPending || draft.trim() === answer}
        onClick={() => save.mutate({ fitCheckItemId, answer: draft.trim() })}
      >
        {t.formatMessage({ defaultMessage: "Save answer" })}
      </Button>
    </div>
  );
}
