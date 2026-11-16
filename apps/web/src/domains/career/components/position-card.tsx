"use client";

import { useEffect, useRef } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ListChecks, MessageSquare, MoreHorizontal } from "lucide-react";

import type { DepthLevel } from "@repo/api/domains/career/depth";
import type { PositionView } from "@repo/api/domains/career/schemas/timeline";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@repo/web/components/ui/dropdown-menu";
import { toast } from "@repo/web/components/ui/sonner";
import { cn } from "@repo/web/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/web/components/ui/tooltip";

import { useTRPC } from "~/tools/trpc/client";

import { useCareerLabels } from "../hooks/use-career-labels";
import { useRefreshCareer } from "../hooks/use-career-queries";
import { useCareerWorkspace } from "./career-workspace-context";
import { LanguageBadges } from "./language-badges";
import { PositionFormDialog } from "./position-form-dialog";

/**
 * A position on the timeline: workflow status, depth (a named level, never
 * a percentage, with a nudge), conflicts to pick from, and actions.
 */
export function PositionCard({
  position,
  others,
  bilingual,
}: {
  position: PositionView;
  others: PositionView[];
  bilingual: boolean;
}) {
  const t = useTranslation();
  const labels = useCareerLabels();
  const trpc = useTRPC();
  const refresh = useRefreshCareer();
  const { activeSessionId, setActiveSessionId, prefillDraft } =
    useCareerWorkspace();
  const onError = (error: { message: string }) => toast.error(error.message);

  // The position's interviewer has a session going: what it found so far
  // can be reviewed and approved.
  const openSessions = useQuery(trpc.interview.openSessions.queryOptions({}));
  const session = openSessions.data?.find(
    (candidate) => candidate.positionId === position.id
  );
  // Under review in the pane beside the chat: marked, and brought into view.
  const reviewed = !!session && session.sessionId === activeSessionId;
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reviewed) card.current?.scrollIntoView({ block: "nearest" });
  }, [reviewed]);

  const remove = useMutation(
    trpc.career.removePosition.mutationOptions({ onSuccess: refresh, onError })
  );
  const restore = useMutation(
    trpc.career.restorePosition.mutationOptions({ onSuccess: refresh, onError })
  );
  const merge = useMutation(
    trpc.career.mergePositions.mutationOptions({ onSuccess: refresh, onError })
  );
  const resolve = useMutation(
    trpc.career.resolveConflict.mutationOptions({ onSuccess: refresh, onError })
  );

  const removed = position.status === "removed";
  const conflictLabel = (field: string) =>
    field === "title"
      ? t.formatMessage({ defaultMessage: "Title" })
      : field === "startDate"
        ? t.formatMessage({ defaultMessage: "Start" })
        : t.formatMessage({ defaultMessage: "End" });

  return (
    <div
      ref={card}
      className={cn(
        "bg-background flex flex-col gap-2 rounded-lg border p-3",
        reviewed && "border-primary ring-primary/40 ring-2"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{position.title}</p>
          <p className="text-muted-foreground truncate text-xs">
            {[
              position.employer,
              labels.period(position.startDate, position.endDate),
            ].join(" · ")}
          </p>
        </div>
        {removed ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => restore.mutate({ positionId: position.id })}
          >
            {t.formatMessage({ defaultMessage: "Restore" })}
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={t.formatMessage({
                  defaultMessage: "Position actions",
                })}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <PositionFormDialog
                position={position}
                trigger={
                  <DropdownMenuItem
                    onSelect={(event) => event.preventDefault()}
                  >
                    {t.formatMessage({ defaultMessage: "Edit" })}
                  </DropdownMenuItem>
                }
              />
              {others.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    {t.formatMessage({ defaultMessage: "Merge into…" })}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {others.map((other) => (
                      <DropdownMenuItem
                        key={other.id}
                        onSelect={() =>
                          merge.mutate({
                            positionId: position.id,
                            intoPositionId: other.id,
                          })
                        }
                      >
                        {[other.title, other.employer].join(" · ")}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => remove.mutate({ positionId: position.id })}
              >
                {t.formatMessage({ defaultMessage: "Remove" })}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {!removed && (
        <div className="flex flex-wrap items-center gap-1.5">
          {/* The workflow status, apart from how deep the story goes. */}
          <span
            className={
              position.status === "approved"
                ? "text-xs text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground text-xs"
            }
          >
            {position.status === "approved"
              ? t.formatMessage({ defaultMessage: "Approved" })
              : position.status === "in_progress"
                ? t.formatMessage({ defaultMessage: "Interview in progress" })
                : t.formatMessage({ defaultMessage: "Not started" })}
          </span>
          {position.origin === "truth_file" && (
            <Badge variant="outline">
              {t.formatMessage({ defaultMessage: "From your career notes" })}
            </Badge>
          )}
          <LanguageBadges
            languages={position.languages}
            bilingual={bilingual}
          />
          {position.depth.level && <DepthBadge level={position.depth.level} />}
        </div>
      )}

      {!removed && (
        <p className="flex flex-wrap gap-x-2 text-xs">
          {position.draftsToReview > 0 && (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {t.formatMessage(
                {
                  defaultMessage:
                    "{count, plural, one {# fact to review} other {# facts to review}}",
                },
                { count: position.draftsToReview }
              )}
            </span>
          )}
          <span className="text-muted-foreground">
            {t.formatMessage(
              {
                defaultMessage:
                  "{evidence, plural, =0 {No approved facts yet} one {# approved fact} other {# approved facts}}, {numbers} with numbers",
              },
              {
                evidence: position.depth.counts.evidence,
                numbers: position.depth.counts.resultsWithNumbers,
              }
            )}
          </span>
        </p>
      )}

      {!removed && position.depth.nudge && !position.depth.done && (
        <p className="text-muted-foreground text-xs">
          {t.formatMessage(
            {
              defaultMessage:
                "{count, plural, one {# achievement has} other {# achievements have}} no number yet.",
            },
            { count: position.depth.nudge.count }
          )}
        </p>
      )}

      {position.conflicts.map((conflict) => (
        <div
          key={conflict.id}
          className="flex flex-col gap-1 rounded-md bg-amber-500/10 p-2"
        >
          <p className="text-xs font-medium">
            {t.formatMessage(
              {
                defaultMessage:
                  "{field} differs between your files. Which is right?",
              },
              { field: conflictLabel(conflict.field) }
            )}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {conflict.options.map((option) => (
              <Button
                key={option}
                size="sm"
                variant="outline"
                // A long title wraps inside the card instead of overflowing.
                className="h-auto min-h-7 max-w-full py-1 text-left whitespace-normal"
                onClick={() =>
                  resolve.mutate({
                    positionConflictId: conflict.id,
                    value: option,
                  })
                }
              >
                {option === "current"
                  ? t.formatMessage({ defaultMessage: "Still there" })
                  : option}
              </Button>
            ))}
          </div>
        </div>
      ))}

      {!removed && (
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            // The chat goes on about this position; the user finishes the
            // sentence.
            onClick={() =>
              prefillDraft(
                t.formatMessage(
                  { defaultMessage: "About {title} at {employer}: " },
                  { title: position.title, employer: position.employer }
                )
              )
            }
          >
            <MessageSquare />
            {t.formatMessage({ defaultMessage: "Talk about it" })}
          </Button>
          {session && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => setActiveSessionId(session.sessionId)}
            >
              <ListChecks />
              {t.formatMessage({ defaultMessage: "What the AI understood" })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** How deep the story goes, with what each level means. */
function DepthBadge({ level }: { level: DepthLevel }) {
  const t = useTranslation();
  const labels = useCareerLabels();
  const levels: Array<[DepthLevel, string]> = [
    [
      "confirmed",
      t.formatMessage({
        defaultMessage: "employer, title and dates confirmed",
      }),
    ],
    [
      "contextualized",
      t.formatMessage({
        defaultMessage:
          "the company, team and scale are clear; projects are listed",
      }),
    ],
    [
      "with_stories",
      t.formatMessage({
        defaultMessage: "at least one story with problem, action and result",
      }),
    ],
    [
      "evidenced",
      t.formatMessage({
        defaultMessage: "results with numbers or scope; tools actually used",
      }),
    ],
    [
      "complete",
      t.formatMessage({
        defaultMessage: "every stage, including the sensitive-data review",
      }),
    ],
  ];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" className="cursor-help">
          {t.formatMessage(
            { defaultMessage: "Depth: {level}" },
            { level: labels.depth(level) }
          )}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        <ul className="flex flex-col gap-1 text-xs">
          {levels.map(([name, meaning]) => (
            <li
              key={name}
              className={name === level ? "font-semibold" : undefined}
            >
              {t.formatMessage(
                { defaultMessage: "{level}: {meaning}" },
                { level: labels.depth(name), meaning }
              )}
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
