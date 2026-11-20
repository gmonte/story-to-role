"use client";

import type {
  ApplicationSource,
  ApplicationStatus,
  ApplicationType,
} from "@repo/api/domains/applications/schemas/application";
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
  const sources: Record<ApplicationSource, string> = {
    linkedin: t.formatMessage({ defaultMessage: "LinkedIn" }),
    company_site: t.formatMessage({ defaultMessage: "Company site" }),
    referral: t.formatMessage({ defaultMessage: "Referral" }),
    job_board: t.formatMessage({ defaultMessage: "Job board" }),
    other: t.formatMessage({ defaultMessage: "Other" }),
  };
  const types: Record<ApplicationType, string> = {
    // A single profile reused across openings (a job board's quick apply,
    // a talent platform).
    simplified: t.formatMessage({
      defaultMessage: "Simplified (a profile you reuse for many openings)",
    }),
    // Stored as “external”: a document or form made for this opening only.
    external: t.formatMessage({
      defaultMessage: "Dedicated (a document or form made for this opening)",
    }),
  };
  return {
    status: (status: ApplicationStatus) => statuses[status],
    source: (source: ApplicationSource | null) =>
      source
        ? sources[source]
        : t.formatMessage({ defaultMessage: "Source not recorded" }),
    sources,
    types,
  };
}
