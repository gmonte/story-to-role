"use client";

import Link from "next/link";

import type {
  BoardFilter,
  BoardOpening,
} from "@repo/api/domains/applications/schemas/tracker";
import { useTranslation } from "@repo/intl/use-translation";
import { InfiniteScroll } from "@repo/web/components/pagination/infinite-scroll";
import { Badge } from "@repo/web/components/ui/badge";
import { Skeleton } from "@repo/web/components/ui/skeleton";

import { useOpeningLabels } from "~/domains/openings/hooks/use-opening-labels";

import type { useBoard } from "../hooks/use-board";
import { useTrackerLabels } from "../hooks/use-tracker-labels";
import { ApplicationStatusBadge } from "./application-status-badge";
import { BoardEmpty } from "./board-empty";

/**
 * The list view (tracker spec, “Tracking”): every opening the filter
 * matches, a page at a time as the page scrolls (ADR 0013).
 */
export function OpeningsList({
  filter,
  board,
}: {
  filter: BoardFilter;
  board: ReturnType<typeof useBoard>;
}) {
  if (board.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (board.rows.length === 0) return <BoardEmpty filter={filter} />;

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col gap-2">
        {board.rows.map((opening) => (
          <OpeningListRow key={opening.openingId} opening={opening} />
        ))}
      </ul>
      <InfiniteScroll
        hasMore={board.hasMore}
        loadingMore={board.loadingMore}
        onLoadMore={board.fetchNextPage}
      />
    </div>
  );
}

function OpeningListRow({ opening }: { opening: BoardOpening }) {
  const t = useTranslation();
  const labels = useTrackerLabels();
  const openingLabels = useOpeningLabels();
  const missing = t.formatMessage({ defaultMessage: "—" });
  const sent = !opening.applicationId
    ? null
    : opening.appliedAt
      ? t.formatMessage(
          { defaultMessage: "Sent {date}" },
          { date: t.formatDate(opening.appliedAt, { dateStyle: "medium" }) }
        )
      : t.formatMessage({ defaultMessage: "Not sent" });
  return (
    <li>
      <Link
        href={`/app/openings/${opening.openingId}`}
        className="bg-card hover:border-primary flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">
            {[opening.company, opening.title].filter(Boolean).join(" · ")}
          </span>
          <span className="text-muted-foreground text-xs">
            {[
              sent ?? missing,
              opening.resumeOrigin
                ? t.formatMessage(
                    { defaultMessage: "Resume: {origin}" },
                    { origin: labels.resumeOrigin(opening.resumeOrigin) }
                  )
                : null,
              opening.source ? labels.source(opening.source) : null,
              opening.applicationId
                ? t.formatMessage(
                    { defaultMessage: "Active {date}" },
                    {
                      date: t.formatDate(opening.lastActivityAt, {
                        dateStyle: "medium",
                      }),
                    }
                  )
                : t.formatMessage(
                    { defaultMessage: "Added {date}" },
                    {
                      date: t.formatDate(opening.lastActivityAt, {
                        dateStyle: "medium",
                      }),
                    }
                  ),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="flex flex-wrap gap-1">
          {opening.fitBand && (
            <Badge variant="outline">
              {openingLabels.band(opening.fitBand)}
            </Badge>
          )}
          {opening.external && (
            <Badge variant="outline">
              {t.formatMessage({ defaultMessage: "Elsewhere" })}
            </Badge>
          )}
          <ApplicationStatusBadge status={opening.status} />
        </span>
      </Link>
    </li>
  );
}
