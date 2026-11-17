"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";

import type {
  ApplicationInstructions,
  InstructionPointView,
  LockedFactOverrideView,
} from "@repo/api/domains/applications/schemas/instructions";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
import { Label } from "@repo/web/components/ui/label";
import { toast } from "@repo/web/components/ui/sonner";
import { Textarea } from "@repo/web/components/ui/textarea";

import { AiAtWork } from "~/domains/workspace/components/ai-at-work";
import { useTRPC } from "~/tools/trpc/client";

import {
  useApplicationInstructions,
  useRefreshInstructions,
} from "../hooks/use-application-instructions";
import { useInstructionLabels } from "../hooks/use-instruction-labels";

/**
 * Application instructions on the generation screen (resume spec): the
 * user writes them, a task splits them (with the gap answers) into points
 * kept for this application, and confirms any locked-fact override before
 * generating.
 */
export function InstructionsReview({
  openingId,
  onUnreviewedChange,
}: {
  openingId: string;
  /** Typed text not yet reviewed: generating now would leave it out. */
  onUnreviewedChange: (unreviewed: boolean) => void;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshInstructions();
  const instructions = useApplicationInstructions(openingId);
  const [text, setText] = useState("");
  const split = useMutation(
    trpc.instructions.split.mutationOptions({
      onSuccess: async () => {
        setText("");
        onUnreviewedChange(false);
        await refresh();
      },
      onError: (error) => toast.error(error.message),
    })
  );
  const data = instructions.data;
  if (!data) return null;

  const drafts = data.points.filter((point) => point.status === "draft");
  const draftOverrides = data.overrides.filter((row) => !row.confirmed);
  const reviewing = drafts.length > 0 || draftOverrides.length > 0;

  return (
    <div className="grid gap-2">
      <Label htmlFor="instructions">
        {t.formatMessage({
          defaultMessage: "Instructions for this application",
        })}
      </Label>
      <ConfirmedInstructions openingId={openingId} instructions={data} />

      {data.splitting ? (
        <AiAtWork
          title={t.formatMessage({
            defaultMessage: "Splitting your instructions into points",
          })}
        />
      ) : reviewing ? (
        <DraftReview
          key={[...drafts, ...draftOverrides].map((row) => row.id).join()}
          openingId={openingId}
          drafts={drafts}
          overrides={draftOverrides}
        />
      ) : (
        <>
          {data.failed && (
            <p className="text-xs text-red-600">
              {t.formatMessage({
                defaultMessage:
                  "Your last instructions could not be split. Try again.",
              })}
            </p>
          )}
          <Textarea
            id="instructions"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              onUnreviewedChange(!!event.target.value.trim());
            }}
            maxLength={4000}
            rows={3}
            placeholder={t.formatMessage({
              defaultMessage:
                "A detail you just remembered, a different framing of an old position, experience that is not in your evidence…",
            })}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">
              {data.pendingGapAnswers > 0 &&
                t.formatMessage(
                  {
                    defaultMessage:
                      "{count, plural, one {# gap answer joins} other {# gap answers join}} them.",
                  },
                  { count: data.pendingGapAnswers }
                )}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={
                split.isPending ||
                (!text.trim() && data.pendingGapAnswers === 0)
              }
              onClick={() => split.mutate({ openingId, text })}
            >
              {t.formatMessage({ defaultMessage: "Review instructions" })}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** What already applies to this application, each removable. */
export function ConfirmedInstructions({
  openingId,
  instructions,
}: {
  openingId: string;
  instructions: ApplicationInstructions;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const labels = useInstructionLabels();
  const refresh = useRefreshInstructions();
  const onError = (error: { message: string }) => toast.error(error.message);
  const removePoint = useMutation(
    trpc.instructions.removePoint.mutationOptions({
      onSuccess: refresh,
      onError,
    })
  );
  const removeOverride = useMutation(
    trpc.instructions.removeOverride.mutationOptions({
      onSuccess: refresh,
      onError,
    })
  );
  const points = instructions.points.filter(
    (point) => point.status === "kept" || point.status === "promoted"
  );
  const overrides = instructions.overrides.filter((row) => row.confirmed);
  if (points.length === 0 && overrides.length === 0) return null;

  return (
    <ul className="grid gap-1">
      {points.map((point) => (
        <li
          key={point.id}
          className="bg-background flex items-start justify-between gap-2 rounded-md border p-2 text-xs"
        >
          <span className="flex flex-col gap-1">
            <span>{point.text}</span>
            {point.status === "promoted" && (
              <Badge variant="secondary" className="self-start">
                {t.formatMessage({ defaultMessage: "Also in your evidence" })}
              </Badge>
            )}
          </span>
          {point.status === "kept" && (
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              aria-label={t.formatMessage({
                defaultMessage: "Remove from this application",
              })}
              onClick={() =>
                removePoint.mutate({ openingId, instructionPointId: point.id })
              }
            >
              <X />
            </Button>
          )}
        </li>
      ))}
      {overrides.map((row) => (
        <li
          key={row.id}
          className="flex items-start justify-between gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 p-2 text-xs"
        >
          <span>{labels.override(row)}</span>
          <Button
            size="icon"
            variant="ghost"
            className="size-6"
            aria-label={t.formatMessage({ defaultMessage: "Remove override" })}
            onClick={() =>
              removeOverride.mutate({ openingId, lockedFactOverrideId: row.id })
            }
          >
            <X />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function DraftReview({
  openingId,
  drafts,
  overrides,
}: {
  openingId: string;
  drafts: InstructionPointView[];
  overrides: LockedFactOverrideView[];
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const labels = useInstructionLabels();
  const refresh = useRefreshInstructions();
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const confirm = useMutation(
    trpc.instructions.confirm.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );

  // Profile_truth replaces this in P8 (docs/plan.md): "send to my profile"
  // will turn a point into a profile suggestion.
  return (
    <div className="grid gap-2 rounded-md border p-2.5">
      <p className="text-muted-foreground text-xs">
        {t.formatMessage({
          defaultMessage: "These points apply to this application only.",
        })}
      </p>
      <ul className="grid gap-2">
        {drafts.map((point) => (
          <li key={point.id} className="text-sm">
            {point.text}
          </li>
        ))}
      </ul>
      {overrides.map((row) => (
        <label
          key={row.id}
          className="flex items-start gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 p-2 text-xs"
        >
          <Checkbox
            className="mt-0.5"
            checked={confirmed.includes(row.id)}
            onCheckedChange={(checked) =>
              setConfirmed(
                checked
                  ? [...confirmed, row.id]
                  : confirmed.filter((id) => id !== row.id)
              )
            }
          />
          {labels.override(row)}
        </label>
      ))}
      <Button
        size="sm"
        className="justify-self-end"
        disabled={confirm.isPending}
        onClick={() =>
          confirm.mutate({
            openingId,
            confirmedLockedFactOverrideIds: confirmed,
          })
        }
      >
        {t.formatMessage({ defaultMessage: "Confirm points" })}
      </Button>
    </div>
  );
}
