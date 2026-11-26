"use client";

import type {
  ApplicationSource,
  ApplicationStatus,
} from "@repo/api/domains/applications/schemas/application";
import type {
  BoardState,
  BoardStatus,
  FitFilter,
  ResumeOrigin,
  SentFilter,
} from "@repo/api/domains/applications/schemas/tracker";
import { useTranslation } from "@repo/intl/use-translation";

import type { BoardFilterField } from "../utils/board-filter";

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

  const boardStatuses: Record<BoardStatus, string> = {
    ...statuses,
    analyzed: t.formatMessage({
      defaultMessage: "Analyzed",
      description: "One opening's status on the Openings page",
    }),
    closed: t.formatMessage({
      defaultMessage: "Closed",
      description: "One opening's status on the Openings page",
    }),
  };
  const states: Record<BoardState, string> = {
    open: t.formatMessage({
      defaultMessage: "Open",
      description: "An opening's state in the Openings filter",
    }),
    closed: t.formatMessage({
      defaultMessage: "Closed",
      description: "An opening's state in the Openings filter",
    }),
  };
  const fits: Record<FitFilter, string> = {
    high: t.formatMessage({ defaultMessage: "High fit" }),
    medium: t.formatMessage({ defaultMessage: "Medium fit" }),
    low: t.formatMessage({ defaultMessage: "Low fit" }),
    not_checked: t.formatMessage({ defaultMessage: "Not checked" }),
  };
  const sent: Record<SentFilter, string> = {
    sent: t.formatMessage({
      defaultMessage: "Sent",
      description: "A value of the Sent filter on the Openings page",
    }),
    not_sent: t.formatMessage({ defaultMessage: "Not sent" }),
  };
  const resumeOrigins: Record<ResumeOrigin, string> = {
    written: t.formatMessage({ defaultMessage: "Written for the opening" }),
    library: t.formatMessage({ defaultMessage: "From the library" }),
    not_recorded: t.formatMessage({ defaultMessage: "Not recorded" }),
  };
  const fields: Record<BoardFilterField, string> = {
    status: t.formatMessage({ defaultMessage: "Status" }),
    state: t.formatMessage({ defaultMessage: "State" }),
    company: t.formatMessage({ defaultMessage: "Company" }),
    source: t.formatMessage({ defaultMessage: "Source" }),
    fit: t.formatMessage({ defaultMessage: "Fit" }),
    sent: t.formatMessage({
      defaultMessage: "Sent",
      description: "A field of the Openings filter",
    }),
    resume: t.formatMessage({ defaultMessage: "Resume" }),
  };
  /** A filter value's name; company values are the user's own text. */
  const filterValue = (field: BoardFilterField, value: string) => {
    switch (field) {
      case "status":
        return boardStatuses[value as BoardStatus];
      case "state":
        return states[value as BoardState];
      case "source":
        return sources[value as ApplicationSource];
      case "fit":
        return fits[value as FitFilter];
      case "sent":
        return sent[value as SentFilter];
      case "resume":
        return resumeOrigins[value as ResumeOrigin];
      case "company":
        return value;
    }
  };
  return {
    status: (status: ApplicationStatus) => statuses[status],
    boardStatus: (status: BoardStatus) => boardStatuses[status],
    resumeOrigin: (origin: ResumeOrigin) => resumeOrigins[origin],
    field: (field: BoardFilterField) => fields[field],
    filterValue,
    source: (source: ApplicationSource | null) =>
      source
        ? sources[source]
        : t.formatMessage({ defaultMessage: "Source not recorded" }),
    sources,
  };
}
