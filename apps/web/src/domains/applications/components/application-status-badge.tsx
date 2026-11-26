import type { ApplicationStatus } from "@repo/api/domains/applications/schemas/application";
import type { BoardStatus } from "@repo/api/domains/applications/schemas/tracker";
import { Badge } from "@repo/web/components/ui/badge";
import { cn } from "@repo/web/lib/utils";

import { useTrackerLabels } from "../hooks/use-tracker-labels";

/**
 * Each status's color (ADR 0012: status tokens). An application's status
 * is an outline with a dot, so it never competes with the fit's soft fill.
 */
export const applicationStatusDot: Record<ApplicationStatus, string> = {
  in_preparation: "bg-status-preparing",
  applied: "bg-status-sent",
  in_process: "bg-status-interview",
  offer: "bg-success",
  hired: "bg-success",
  rejected: "bg-destructive",
  withdrawn: "bg-status-analyzed",
  no_response: "bg-status-analyzed",
};

/** An opening with no application: not analyzed, analyzed, or closed. */
const boardOnlyDot = {
  unanalyzed: "bg-border",
  analyzed: "bg-status-analyzed",
  closed: "bg-muted-foreground",
};

export function ApplicationStatusDot({
  status,
  className,
}: {
  status: BoardStatus;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full",
        status === "unanalyzed" || status === "analyzed" || status === "closed"
          ? boardOnlyDot[status]
          : applicationStatusDot[status],
        className
      )}
    />
  );
}

export function ApplicationStatusBadge({ status }: { status: BoardStatus }) {
  const labels = useTrackerLabels();
  return (
    <Badge variant="outline" className="gap-1.5">
      <ApplicationStatusDot status={status} />
      {labels.boardStatus(status)}
    </Badge>
  );
}
