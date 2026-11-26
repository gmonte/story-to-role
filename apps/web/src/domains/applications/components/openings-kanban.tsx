"use client";

import { useState } from "react";

import {
  type InfiniteData,
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { MoreVertical } from "lucide-react";
import Link from "next/link";

import { applicationStatusSchema } from "@repo/api/domains/applications/schemas/application";
import type {
  BoardFilter,
  BoardOpening,
  BoardStatus,
} from "@repo/api/domains/applications/schemas/tracker";
import { useTranslation } from "@repo/intl/use-translation";
import { InfiniteScroll } from "@repo/web/components/pagination/infinite-scroll";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/web/components/ui/dropdown-menu";
import { Skeleton } from "@repo/web/components/ui/skeleton";
import { toast } from "@repo/web/components/ui/sonner";
import { cn } from "@repo/web/lib/utils";

import { useOpeningLabels } from "~/domains/openings/hooks/use-opening-labels";
import { useTRPC } from "~/tools/trpc/client";

import { useBoard } from "../hooks/use-board";
import { useRefreshTracker } from "../hooks/use-tracker";
import { useTrackerLabels } from "../hooks/use-tracker-labels";
import { boardColumns } from "../utils/board-columns";
import { daysSince } from "../utils/dates";
import { planBoardMove, type BoardMove } from "../utils/status-move";
import { ApplicationHint } from "./application-hint";
import { ApplicationStatusDot } from "./application-status-badge";
import { MarkAppliedDialog } from "./application-tracker";
import { WithdrawDialog } from "./withdraw-dialog";

const pageSize = 10;

/**
 * The kanban view (tracker spec, “Tracking”): a column per board status,
 * each loading its own pages as it scrolls inside (ADR 0013). Dragging a
 * card changes its status by the board's rules (`planBoardMove`); the card
 * moves at once and goes back if the change fails.
 */
export function OpeningsKanban({ filter }: { filter: BoardFilter }) {
  const { move, dialogs } = useBoardMove();
  const [dragging, setDragging] = useState<BoardOpening | null>(null);
  const [over, setOver] = useState<BoardStatus | null>(null);

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {boardColumns(filter).map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            filter={filter}
            over={over === status}
            dragging={dragging}
            onDragOver={() => setOver(status)}
            onDragLeave={() =>
              setOver((current) => (current === status ? null : current))
            }
            onDrop={() => {
              const dropped = dragging;
              setDragging(null);
              setOver(null);
              if (dropped) move(dropped, status);
            }}
            onDragStart={setDragging}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            onMove={move}
          />
        ))}
      </div>
      {dialogs}
    </>
  );
}

function KanbanColumn({
  status,
  filter,
  over,
  dragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  status: BoardStatus;
  filter: BoardFilter;
  over: boolean;
  dragging: BoardOpening | null;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragStart: (opening: BoardOpening) => void;
  onDragEnd: () => void;
  onMove: (opening: BoardOpening, to: BoardStatus) => void;
}) {
  const t = useTranslation();
  const labels = useTrackerLabels();
  const column = useBoard({
    filter,
    sort: "activity",
    column: status,
    limit: pageSize,
  });
  return (
    <section
      aria-label={labels.boardStatus(status)}
      onDragOver={(event) => {
        if (!dragging) return;
        event.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      className={cn(
        "bg-muted/40 flex max-h-[calc(100svh-16rem)] min-h-40 w-64 shrink-0 flex-col gap-2 rounded-lg border p-2",
        over && "border-primary bg-muted"
      )}
    >
      <h2 className="flex items-center justify-between px-1 text-xs font-medium">
        <span className="flex items-center gap-1.5">
          <ApplicationStatusDot status={status} />
          {labels.boardStatus(status)}
        </span>
        <span className="text-muted-foreground">
          {column.total !== undefined && t.formatNumber(column.total)}
        </span>
      </h2>
      {/* Each column scrolls on its own and loads its next page there. */}
      <div className="flex min-h-12 flex-col overflow-y-auto">
        {column.isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1].map((index) => (
              <Skeleton key={index} className="h-20 w-full rounded-md" />
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {column.rows.map((opening) => (
              <KanbanCard
                key={opening.openingId}
                opening={opening}
                dragging={dragging?.openingId === opening.openingId}
                onDragStart={() => onDragStart(opening)}
                onDragEnd={onDragEnd}
                onMove={(to) => onMove(opening, to)}
              />
            ))}
          </ul>
        )}
        <InfiniteScroll
          hasMore={column.hasMore}
          loadingMore={column.loadingMore}
          onLoadMore={column.fetchNextPage}
        />
      </div>
    </section>
  );
}

function KanbanCard({
  opening,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  opening: BoardOpening;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (to: BoardStatus) => void;
}) {
  const t = useTranslation();
  const labels = useTrackerLabels();
  const openingLabels = useOpeningLabels();
  const now = new Date();
  const days = opening.appliedAt
    ? t.formatMessage(
        {
          defaultMessage:
            "Sent {days, plural, =0 {today} one {# day ago} other {# days ago}}",
        },
        { days: daysSince(opening.appliedAt, now) }
      )
    : opening.applicationId
      ? t.formatMessage(
          {
            defaultMessage:
              "Active {days, plural, =0 {today} one {# day ago} other {# days ago}}",
          },
          { days: daysSince(opening.lastActivityAt, now) }
        )
      : t.formatMessage(
          {
            defaultMessage:
              "Added {days, plural, =0 {today} one {# day ago} other {# days ago}}",
          },
          { days: daysSince(opening.lastActivityAt, now) }
        );
  // Where the card may go: the menu offers only moves the rules allow.
  const targets = boardColumns({}).filter((to) => {
    const plan = planBoardMove(opening, to);
    return plan.kind !== "none" && plan.kind !== "rejected";
  });
  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", opening.openingId);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "bg-card hover:border-primary flex cursor-grab items-start gap-1 rounded-md border p-2 text-xs",
        dragging && "opacity-50"
      )}
    >
      <Link
        href={`/app/openings/${opening.openingId}`}
        draggable={false}
        className="flex min-w-0 flex-1 flex-col gap-1"
      >
        <span className="text-sm font-medium break-words">
          {[opening.company, opening.title].filter(Boolean).join(" · ")}
        </span>
        <span className="text-muted-foreground">{days}</span>
        {opening.applicationId && (
          <span className="text-muted-foreground break-words">
            <ApplicationHint application={opening} />
          </span>
        )}
        {opening.fitBand && (
          <Badge variant="outline" className="self-start">
            {openingLabels.band(opening.fitBand)}
          </Badge>
        )}
      </Link>
      {targets.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              aria-label={t.formatMessage(
                { defaultMessage: "Change status of {company}" },
                { company: opening.company ?? opening.title ?? "" }
              )}
            >
              <MoreVertical className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {targets.map((status) => (
              <DropdownMenuItem key={status} onSelect={() => onMove(status)}>
                {labels.boardStatus(status)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

type BoardPage = {
  data: BoardOpening[];
  nextCursor: string | null;
  total: number;
};

/**
 * The card's move in every loaded column at once: out of its column and on
 * top of the target's, totals adjusted. Returns how to put it back.
 */
function useOptimisticMove() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return (opening: BoardOpening, to: BoardStatus) => {
    const entries = queryClient.getQueriesData<InfiniteData<BoardPage>>({
      queryKey: trpc.tracker.board.pathKey(),
    });
    const columnOf = (key: QueryKey) =>
      (key[1] as { input?: { column?: BoardStatus } } | undefined)?.input
        ?.column;
    for (const [key, data] of entries) {
      if (!data) continue;
      const column = columnOf(key);
      if (column === opening.status) {
        queryClient.setQueryData<InfiniteData<BoardPage>>(key, {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            data: page.data.filter(
              (row) => row.openingId !== opening.openingId
            ),
            total: Math.max(0, page.total - 1),
          })),
        });
      } else if (column === to) {
        queryClient.setQueryData<InfiniteData<BoardPage>>(key, {
          ...data,
          pages: data.pages.map((page, index) => ({
            ...page,
            data:
              index === 0
                ? [{ ...opening, status: to }, ...page.data]
                : page.data,
            total: page.total + 1,
          })),
        });
      }
    }
    return () => {
      for (const [key, data] of entries) queryClient.setQueryData(key, data);
    };
  };
}

/**
 * Moves a card by the board's rules: plain changes at once (and back on
 * failure), "Applied" and "Withdrawn" through their dialogs (cancelling
 * leaves the card), the rest refused with the reason.
 */
function useBoardMove() {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshTracker();
  const optimistic = useOptimisticMove();
  const [pending, setPending] = useState<{
    opening: BoardOpening;
    applicationId: string | null;
    kind: "mark_applied" | "withdraw";
  } | null>(null);
  const ensure = useMutation(trpc.tracker.ensureForOpening.mutationOptions());
  const setStatus = useMutation(trpc.tracker.setStatus.mutationOptions());
  const setClosed = useMutation(trpc.openings.setClosed.mutationOptions());

  const reasons: Record<
    Extract<BoardMove, { kind: "rejected" }>["reason"],
    string
  > = {
    no_response: t.formatMessage({
      defaultMessage:
        "“No response” only comes with time; it can’t be set by hand.",
    }),
    applied_from_preparation: t.formatMessage({
      defaultMessage:
        "Only an application in preparation can be marked as applied.",
    }),
    to_analyzed: t.formatMessage({
      defaultMessage: "An application can’t go back to Analyzed.",
    }),
    to_closed: t.formatMessage({
      defaultMessage:
        "Only an analyzed opening can be closed here; give up on the application instead.",
    }),
    from_closed: t.formatMessage({
      defaultMessage: "Reopen the opening on its page first.",
    }),
  };

  /** Runs a change with the card already moved, put back if it fails. */
  const run = async (
    opening: BoardOpening,
    to: BoardStatus,
    change: () => Promise<unknown>
  ) => {
    const undo = optimistic(opening, to);
    try {
      await change();
    } catch (error) {
      undo();
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      await refresh();
    }
  };

  const move = (opening: BoardOpening, to: BoardStatus) => {
    const plan = planBoardMove(opening, to);
    const applicationId = opening.applicationId;
    switch (plan.kind) {
      case "none":
        return;
      case "rejected":
        toast.error(reasons[plan.reason]);
        return;
      case "close_opening":
        void run(opening, to, () =>
          setClosed.mutateAsync({ openingId: opening.openingId, closed: true })
        );
        return;
      case "set_status": {
        const status = applicationStatusSchema.safeParse(to);
        if (!applicationId || !status.success) return;
        void run(opening, to, () =>
          setStatus.mutateAsync({ applicationId, status: status.data })
        );
        return;
      }
      case "mark_applied":
      case "withdraw":
        setPending({ opening, applicationId, kind: plan.kind });
        return;
      case "create_application":
        if (plan.then.kind === "mark_applied") {
          // The dialog creates the application as it records what was sent.
          setPending({ opening, applicationId: null, kind: "mark_applied" });
          return;
        }
        void run(opening, to, async () => {
          const created = await ensure.mutateAsync({
            openingId: opening.openingId,
          });
          const status = applicationStatusSchema.safeParse(to);
          if (plan.then.kind === "set_status" && status.success) {
            await setStatus.mutateAsync({
              applicationId: created.applicationId,
              status: status.data,
            });
          }
        });
        return;
    }
  };

  const dialogs = pending && (
    <>
      <MarkAppliedDialog
        key={`applied-${pending.opening.openingId}`}
        applicationId={pending.applicationId}
        openingId={pending.opening.openingId}
        open={pending.kind === "mark_applied"}
        onOpenChange={(open) => !open && setPending(null)}
      />
      {pending.kind === "withdraw" && pending.applicationId && (
        <WithdrawFromBoard
          key={`withdraw-${pending.applicationId}`}
          applicationId={pending.applicationId}
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
