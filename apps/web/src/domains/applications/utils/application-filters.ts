import {
  applicationStatusSchema,
  applicationTypeSchema,
  type ApplicationStatus,
  type ApplicationType,
} from "@repo/api/domains/applications/schemas/application";
import type { TrackedApplication } from "@repo/api/domains/applications/schemas/tracker";

export type SentFilter = "all" | "sent" | "not_sent";
export type SortKey = "activity" | "sent" | "company" | "status";

export type ApplicationFilters = {
  statuses: ApplicationStatus[];
  type: ApplicationType | "all";
  company: string;
  sent: SentFilter;
  sort: SortKey;
};

export const defaultFilters: ApplicationFilters = {
  statuses: [],
  type: "all",
  company: "",
  sent: "all",
  sort: "activity",
};

const sortKeys: string[] = ["activity", "sent", "company", "status"];
const sentValues: string[] = ["all", "sent", "not_sent"];

/** The filters the URL carries; anything unknown falls back to the default. */
export function parseFilters(
  params: Pick<URLSearchParams, "get">
): ApplicationFilters {
  const statuses = (params.get("status") ?? "")
    .split(",")
    .filter(
      (value): value is ApplicationStatus =>
        applicationStatusSchema.safeParse(value).success
    );
  const type = applicationTypeSchema.safeParse(params.get("type"));
  const sent = params.get("sent") ?? "";
  const sort = params.get("sort") ?? "";
  return {
    statuses: [...new Set(statuses)],
    type: type.success ? type.data : "all",
    company: params.get("company") ?? "",
    sent: sentValues.includes(sent) ? (sent as SentFilter) : "all",
    sort: sortKeys.includes(sort) ? (sort as SortKey) : "activity",
  };
}

/** Only what differs from the default goes in the URL. */
export function filtersToParams(filters: ApplicationFilters) {
  const params: Record<string, string> = {};
  if (filters.statuses.length > 0) params.status = filters.statuses.join(",");
  if (filters.type !== "all") params.type = filters.type;
  if (filters.company.trim()) params.company = filters.company;
  if (filters.sent !== "all") params.sent = filters.sent;
  if (filters.sort !== "activity") params.sort = filters.sort;
  return params;
}

const norm = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterApplications(
  applications: TrackedApplication[],
  filters: ApplicationFilters
) {
  const query = norm(filters.company.trim());
  return applications.filter((application) => {
    if (
      filters.statuses.length > 0 &&
      !filters.statuses.includes(application.status)
    ) {
      return false;
    }
    if (
      filters.type !== "all" &&
      application.applicationType !== filters.type
    ) {
      return false;
    }
    if (filters.sent === "sent" && !application.appliedAt) return false;
    if (filters.sent === "not_sent" && application.appliedAt) return false;
    if (query && !norm(application.company ?? "").includes(query)) return false;
    return true;
  });
}

const statusOrder = applicationStatusSchema.options;

/** A sorted copy: dates newest first, company A to Z, status in funnel order. */
export function sortApplications(
  applications: TrackedApplication[],
  sort: SortKey
) {
  const time = (date: Date | null) => date?.getTime() ?? -Infinity;
  const compare = (a: TrackedApplication, b: TrackedApplication) => {
    switch (sort) {
      case "activity":
        return time(b.lastActivityAt) - time(a.lastActivityAt);
      case "sent": {
        // Not sent goes last.
        const x = time(a.appliedAt);
        const y = time(b.appliedAt);
        return x === y ? 0 : y > x ? 1 : -1;
      }
      case "company":
        return (a.company ?? "").localeCompare(b.company ?? "", undefined, {
          sensitivity: "base",
        });
      case "status":
        return statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
    }
  };
  return [...applications].sort(
    (a, b) => compare(a, b) || time(b.lastActivityAt) - time(a.lastActivityAt)
  );
}

const day = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `now`, never negative. */
export function daysSince(from: Date, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / day));
}
