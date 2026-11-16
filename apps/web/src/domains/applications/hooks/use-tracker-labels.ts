"use client";

import type { ApplicationStatus } from "@repo/api/domains/applications/schemas/application";
import { useTranslation } from "@repo/intl/use-translation";

/** The tracker's statuses in the user's language. */
export function useTrackerLabels() {
  const t = useTranslation();
  const statuses: Record<ApplicationStatus, string> = {
    in_preparation: t.formatMessage({ defaultMessage: "In preparation" }),
    applied: t.formatMessage({ defaultMessage: "Applied" }),
    in_process: t.formatMessage({ defaultMessage: "In process" }),
    offer: t.formatMessage({ defaultMessage: "Offer" }),
    hired: t.formatMessage({ defaultMessage: "Hired" }),
    rejected: t.formatMessage({ defaultMessage: "Rejected" }),
    withdrawn: t.formatMessage({ defaultMessage: "Withdrawn" }),
    no_response: t.formatMessage({ defaultMessage: "No response" }),
  };
  return { status: (status: ApplicationStatus) => statuses[status] };
}
