"use client";

import { useState } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";
import { MoreVertical } from "lucide-react";
import Link from "next/link";

import {
  applicationStatusSchema,
  type ApplicationStatus,
} from "@repo/api/domains/applications/schemas/application";
import type { TrackedApplication } from "@repo/api/domains/applications/schemas/tracker";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/web/components/ui/dropdown-menu";
import { toast } from "@repo/web/components/ui/sonner";
import { cn } from "@repo/web/lib/utils";

import { useOpeningLabels } from "~/domains/openings/hooks/use-opening-labels";
import { useTRPC } from "~/tools/trpc/client";

import { useRefreshTracker } from "../hooks/use-tracker";
import { useTrackerLabels } from "../hooks/use-tracker-labels";
import {
  daysSince,
  filterApplications,
  sortApplications,
  type ApplicationFilters,
} from "../utils/application-filters";
import { planStatusMove } from "../utils/status-move";
import { ApplicationHint } from "./application-hint";
import { MarkAppliedDialog } from "./application-tracker";
import { WithdrawDialog } from "./withdraw-dialog";

/**
 * The kanban view: a column per status in tracker order. Dragging a card to
 * another column changes its status by the same rules as the status select.
 */
export function ApplicationsKanban({
  applications,
  filters,
}: {
  applications: TrackedApplication[];
  filters: ApplicationFilters;
}) {
  const t = useTranslation();
  const labels = useTrackerLabels();
  const { move, dialogs } = useStatusMove();
  const [dragging, setDragging] = useState<TrackedApplication | null>(null);
  const [over, setOver] = useState<ApplicationStatus | null>(null);
  const visible = sortApplications(
    filterApplications(applications, filters),
    "activity"
  );

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {applicationStatusSchema.options.map((status) => {
          const cards = visible.filter((row) => row.status === status);
          return (
            <section
              key={status}
              aria-label={labels.status(status)}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                setOver(status);
              }}
              onDragLeave={() =>
                setOver((current) => (current === status ? null : current))
              }
              onDrop={(event) => {
                event.preventDefault();
                const dropped = dragging;
                setDragging(null);
                setOver(null);
                if (dropped) move(dropped, status);
              }}
              className={cn(
                "bg-muted/40 flex w-64 shrink-0 flex-col gap-2 rounded-lg border p-2",
                over === status && "border-primary bg-muted"
              )}
            >
              <h2 className="flex items-center justify-between px-1 text-xs font-medium">
                {labels.status(status)}
                <span className="text-muted-foreground">
                  {t.formatNumber(cards.length)}
                </span>
              </h2>
              <ul className="flex min-h-12 flex-col gap-2">
                {cards.map((application) => (
                  <KanbanCard
                    key={application.id}
                    application={application}
                    dragging={dragging?.id === application.id}
                    onDragStart={() => setDragging(application)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    onMove={(to) => move(application, to)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {dialogs}
    </>
  );
}

function KanbanCard({
  application,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  application: TrackedApplication;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (to: ApplicationStatus) => void;
}) {
  const t = useTranslation();
  const labels = useTrackerLabels();
  const openingLabels = useOpeningLabels();
  const now = new Date();
  const days = application.appliedAt
    ? t.formatMessage(
        {
          defaultMessage:
            "Sent {days, plural, =0 {today} one {# day ago} other {# days ago}}",
        },
        { days: daysSince(application.appliedAt, now) }
      )
    : t.formatMessage(
        {
          defaultMessage:
            "Active {days, plural, =0 {today} one {# day ago} other {# days ago}}",
        },
        { days: daysSince(application.lastActivityAt, now) }
      );
  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", application.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "bg-card hover:border-primary flex cursor-grab items-start gap-1 rounded-md border p-2 text-xs",
        dragging && "opacity-50"
      )}
    >
      <Link
        href={`/app/openings/${application.openingId}`}
        draggable={false}
        className="flex min-w-0 flex-1 flex-col gap-1"
      >
        <span className="text-sm font-medium break-words">
          {[application.company, application.title].filter(Boolean).join(" · ")}
        </span>
        <span className="text-muted-foreground">{days}</span>
        <span className="text-muted-foreground break-words">
          <ApplicationHint application={application} />
        </span>
        {application.fitBand && (
          <Badge variant="outline" className="self-start">
            {openingLabels.band(application.fitBand)}
          </Badge>
        )}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            aria-label={t.formatMessage(
              { defaultMessage: "Change status of {company}" },
              { company: application.company ?? application.title ?? "" }
            )}
          >
            <MoreVertical className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {applicationStatusSchema.options
            .filter((status) => status !== application.status)
            .map((status) => (
              <DropdownMenuItem key={status} onSelect={() => onMove(status)}>
                {labels.status(status)}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/**
 * Moves an application by the status rules (see `planStatusMove`): plain
 * changes happen at once, "Applied" and "Withdrawn" open their dialogs
 * (cancelling leaves the card where it was), "No response" is refused.
 */
function useStatusMove() {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshTracker();
  const [pending, setPending] = useState<{
    application: TrackedApplication;
    kind: "mark_applied" | "withdraw";
  } | null>(null);
  const setStatus = useMutation(
    trpc.tracker.setStatus.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );

  const move = (application: TrackedApplication, to: ApplicationStatus) => {
    const plan = planStatusMove(application, to);
    switch (plan.kind) {
      case "none":
        return;
      case "set_status":
        setStatus.mutate({ applicationId: application.id, status: to });
        return;
      case "mark_applied":
      case "withdraw":
        setPending({ application, kind: plan.kind });
        return;
      case "rejected":
        toast.error(
          plan.reason === "no_response"
            ? t.formatMessage({
                defaultMessage:
                  "“No response” only comes with time; it can’t be set by hand.",
              })
            : t.formatMessage({
                defaultMessage:
                  "Only an application in preparation can be marked as applied.",
              })
        );
        return;
    }
  };

  const dialogs = pending && (
    <>
      <MarkAppliedDialog
        key={`applied-${pending.application.id}`}
        applicationId={pending.application.id}
        openingId={pending.application.openingId}
        open={pending.kind === "mark_applied"}
        onOpenChange={(open) => !open && setPending(null)}
      />
      {pending.kind === "withdraw" && (
        <WithdrawFromBoard
          key={`withdraw-${pending.application.id}`}
          applicationId={pending.application.id}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
  return { move, dialogs };
}

/** The withdraw dialog needs the application's detail: it loads it first. */
function WithdrawFromBoard({
  applicationId,
  onClose,
}: {
  applicationId: string;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const detail = useQuery(trpc.tracker.get.queryOptions({ applicationId }));
  if (!detail.data) return null;
  return (
    <WithdrawDialog
      detail={detail.data}
      open
      onOpenChange={(open) => !open && onClose()}
    />
  );
}
