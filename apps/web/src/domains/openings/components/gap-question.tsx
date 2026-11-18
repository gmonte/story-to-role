"use client";

import { useId, useState } from "react";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";

import type {
  FitCheckItemView,
  OpeningDetail,
} from "@repo/api/domains/openings/schemas/opening-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
import { Label } from "@repo/web/components/ui/label";
import { toast } from "@repo/web/components/ui/sonner";
import { Textarea } from "@repo/web/components/ui/textarea";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshOpenings } from "../hooks/use-opening";

/**
 * One gap question (fit check spec): "I have it" with where it happened,
 * or "I don't have it"; either way the answer is recorded for this
 * opening and suggested to the profile.
 */
export function GapQuestion({
  fitCheckItemId,
  question,
  answer,
  lacks,
  links,
  positions,
  projects,
}: {
  fitCheckItemId: string;
  question: string;
  answer: string | null;
  /** The user confirmed they lack it: a suggestion went to their profile. */
  lacks: boolean;
  links: FitCheckItemView["gapLinks"];
  positions: NonNullable<OpeningDetail["fitCheck"]>["positions"];
  projects: NonNullable<OpeningDetail["fitCheck"]>["projects"];
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshOpenings();
  const [draft, setDraft] = useState(answer ?? "");
  // “I have it” asks where; “I don't have it” asks nothing more.
  const [mode, setMode] = useState<"have" | "lack">(lacks ? "lack" : "have");
  // The user changed their mind after confirming they lack it.
  const [reopened, setReopened] = useState(false);
  // A checkbox wrapped in its label toggled twice per click (the label
  // clicks it again): each gets an id its label points at instead.
  const gapId = useId();
  const [positionIds, setPositionIds] = useState<string[]>(
    links?.positionIds ?? []
  );
  const [projectIds, setProjectIds] = useState<string[]>(
    links?.projectIds ?? []
  );
  const [notTied, setNotTied] = useState(links?.notTied ?? false);
  const [sent, setSent] = useState(false);
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
  const tied = positionIds.length + projectIds.length > 0 || notTied;
  const save = useMutation(
    trpc.openings.answerGapQuestion.mutationOptions({
      onSuccess: async (result, input) => {
        await refresh();
        setReopened(false);
        setSent(!input.lacks && result.profileSuggestionIds.length > 0);
        toast.success(
          input.lacks
            ? result.profileSuggestionIds.length > 0
              ? t.formatMessage({
                  defaultMessage:
                    "Noted. A suggestion waits for you in My career.",
                })
              : t.formatMessage({ defaultMessage: "Noted for this opening." })
            : t.formatMessage({
                defaultMessage: "Answer saved for this opening.",
              })
        );
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const myCareer = (
    <Link href="/app/career" className="underline">
      {t.formatMessage({ defaultMessage: "Open My career" })}
    </Link>
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-sm">{question}</p>
      {lacks && !reopened ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-muted-foreground flex flex-wrap gap-x-1 text-xs">
            <span>
              {t.formatMessage({
                defaultMessage:
                  "You said you don't have it. A suggestion was sent to My career.",
              })}
            </span>
            {myCareer}
          </p>
          <Button size="sm" variant="ghost" onClick={() => setReopened(true)}>
            {t.formatMessage({ defaultMessage: "Answer instead" })}
          </Button>
        </div>
      ) : (
        <>
          {lacks && (
            <p className="text-muted-foreground text-xs">
              {t.formatMessage({
                defaultMessage:
                  "The suggestion already sent stays in My career until you reject it there.",
              })}
            </p>
          )}
          <Textarea
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              mode === "have"
                ? t.formatMessage({ defaultMessage: "Tell us what you did" })
                : t.formatMessage({
                    defaultMessage: "Optional: say it in your own words",
                  })
            }
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === "have" ? "secondary" : "ghost"}
              onClick={() => setMode("have")}
            >
              {t.formatMessage({ defaultMessage: "I have it" })}
            </Button>
            <Button
              size="sm"
              variant={mode === "lack" ? "secondary" : "ghost"}
              onClick={() => setMode("lack")}
            >
              {t.formatMessage({ defaultMessage: "I don't have it" })}
            </Button>
          </div>
          {mode === "have" ? (
            <div className="grid gap-2 rounded-md border p-2.5">
              <Label>
                {t.formatMessage({ defaultMessage: "Where did you do it?" })}
              </Label>
              {positions.map((position) => (
                <div
                  key={position.positionId}
                  className="flex items-center gap-2"
                >
                  <Checkbox
                    id={`${gapId}-${position.positionId}`}
                    checked={positionIds.includes(position.positionId)}
                    onCheckedChange={() =>
                      setPositionIds(toggle(positionIds, position.positionId))
                    }
                  />
                  <Label
                    htmlFor={`${gapId}-${position.positionId}`}
                    className="font-normal"
                  >
                    {t.formatMessage(
                      { defaultMessage: "{title} at {employer}" },
                      { title: position.title, employer: position.employer }
                    )}
                  </Label>
                </div>
              ))}
              {projects.map((project) => (
                <div
                  key={project.projectId}
                  className="flex items-center gap-2"
                >
                  <Checkbox
                    id={`${gapId}-${project.projectId}`}
                    checked={projectIds.includes(project.projectId)}
                    onCheckedChange={() =>
                      setProjectIds(toggle(projectIds, project.projectId))
                    }
                  />
                  <Label
                    htmlFor={`${gapId}-${project.projectId}`}
                    className="font-normal"
                  >
                    {t.formatMessage(
                      { defaultMessage: "{name} (project)" },
                      { name: project.name }
                    )}
                  </Label>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${gapId}-not-tied`}
                  checked={notTied}
                  onCheckedChange={(checked) => setNotTied(checked === true)}
                />
                <Label htmlFor={`${gapId}-not-tied`} className="font-normal">
                  {t.formatMessage({
                    defaultMessage: "Not tied to a position",
                  })}
                </Label>
              </div>
              <p className="text-muted-foreground text-xs">
                {t.formatMessage({
                  defaultMessage:
                    "A suggestion adds your answer to each one you pick, for you to accept in My career.",
                })}
              </p>
              <Button
                size="sm"
                className="self-start"
                disabled={!draft.trim() || !tied || save.isPending}
                onClick={() =>
                  save.mutate({
                    fitCheckItemId,
                    answer: draft.trim(),
                    positionIds,
                    projectIds,
                    notTied,
                  })
                }
              >
                {t.formatMessage({ defaultMessage: "Save answer" })}
              </Button>
              {(sent || (answer && tied)) && (
                <p className="text-muted-foreground flex flex-wrap gap-x-1 text-xs">
                  <span>
                    {t.formatMessage({
                      defaultMessage:
                        "Sent to your profile — accept it in My career.",
                    })}
                  </span>
                  {myCareer}
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-1.5 rounded-md border p-2.5">
              <p className="text-muted-foreground text-xs">
                {t.formatMessage({
                  defaultMessage:
                    "The suggestion goes to your profile's known gaps.",
                })}
              </p>
              <Button
                size="sm"
                className="self-start"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({
                    fitCheckItemId,
                    lacks: true,
                    answer: draft.trim() || undefined,
                  })
                }
              >
                {t.formatMessage({ defaultMessage: "Confirm I don't have it" })}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
