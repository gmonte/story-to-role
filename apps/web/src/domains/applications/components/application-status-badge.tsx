import type { ApplicationStatus } from "@repo/api/domains/applications/schemas/application";
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

export function ApplicationStatusDot({
  status,
  className,
}: {
  status: ApplicationStatus;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full",
        applicationStatusDot[status],
        className
      )}
    />
  );
}

export function ApplicationStatusBadge({
  status,
}: {
  status: ApplicationStatus;
}) {
  const labels = useTrackerLabels();
  return (
    <Badge variant="outline" className="gap-1.5">
      <ApplicationStatusDot status={status} />
      {labels.status(status)}
    </Badge>
  );
}
