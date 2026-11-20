"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";

import {
  applicationStatusSchema,
  type ApplicationType,
} from "@repo/api/domains/applications/schemas/application";
import type { TrackedApplication } from "@repo/api/domains/applications/schemas/tracker";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@repo/web/components/ui/dropdown-menu";
import { Input } from "@repo/web/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/web/components/ui/select";

import { useOpeningLabels } from "~/domains/openings/hooks/use-opening-labels";

import { useTrackerLabels } from "../hooks/use-tracker-labels";
import {
  defaultFilters,
  filterApplications,
  sortApplications,
  type ApplicationFilters,
  type SentFilter,
  type SortKey,
} from "../utils/application-filters";

/** The short name of each application type. */
function useTypeNames() {
  const t = useTranslation();
  const names: Record<ApplicationType, string> = {
    simplified: t.formatMessage({ defaultMessage: "Standard" }),
    external: t.formatMessage({ defaultMessage: "Dedicated" }),
  };
  return names;
}

/** The list view: filters and sorting over the tracker's applications. */
export function ApplicationsList({
  applications,
  filters,
  onFiltersChange,
}: {
  applications: TrackedApplication[];
  filters: ApplicationFilters;
  onFiltersChange: (filters: ApplicationFilters) => void;
}) {
  const t = useTranslation();
  const rows = sortApplications(
    filterApplications(applications, filters),
    filters.sort
  );
  return (
    <div className="flex flex-col gap-3">
      <ApplicationFiltersBar filters={filters} onChange={onFiltersChange} />
      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center">
          {t.formatMessage({
            defaultMessage: "No application matches these filters.",
          })}
        </p>
      ) : (
        <ul className="grid gap-2">
          {rows.map((application) => (
            <ApplicationListRow
              key={application.id}
              application={application}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Filters shared by both views; the sort only shows in the list. */
export function ApplicationFiltersBar({
  filters,
  onChange,
  withSort = true,
}: {
  filters: ApplicationFilters;
  onChange: (filters: ApplicationFilters) => void;
  withSort?: boolean;
}) {
  const t = useTranslation();
  const labels = useTrackerLabels();
  const typeNames = useTypeNames();
  const filtered =
    filters.statuses.length > 0 ||
    filters.type !== "all" ||
    filters.sent !== "all" ||
    filters.company.trim() !== "";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="h-8 w-44"
        value={filters.company}
        aria-label={t.formatMessage({ defaultMessage: "Search by company" })}
        placeholder={t.formatMessage({ defaultMessage: "Company" })}
        onChange={(event) =>
          onChange({ ...filters, company: event.target.value })
        }
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            {filters.statuses.length > 0
              ? t.formatMessage(
                  { defaultMessage: "Status ({count, number})" },
                  { count: filters.statuses.length }
                )
              : t.formatMessage({ defaultMessage: "All statuses" })}
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {applicationStatusSchema.options.map((status) => (
            <DropdownMenuCheckboxItem
              key={status}
              checked={filters.statuses.includes(status)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) =>
                onChange({
                  ...filters,
                  statuses: checked
                    ? [...filters.statuses, status]
                    : filters.statuses.filter((item) => item !== status),
                })
              }
            >
              {labels.status(status)}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Select
        value={filters.type}
        onValueChange={(type) =>
          onChange({ ...filters, type: type as ApplicationFilters["type"] })
        }
      >
        <SelectTrigger
          size="sm"
          aria-label={t.formatMessage({ defaultMessage: "Type" })}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            {t.formatMessage({ defaultMessage: "All types" })}
          </SelectItem>
          <SelectItem value="simplified">{typeNames.simplified}</SelectItem>
          <SelectItem value="external">{typeNames.external}</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={filters.sent}
        onValueChange={(sent) =>
          onChange({ ...filters, sent: sent as SentFilter })
        }
      >
        <SelectTrigger
          size="sm"
          aria-label={t.formatMessage({ defaultMessage: "Sent" })}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            {t.formatMessage({ defaultMessage: "Sent or not" })}
          </SelectItem>
          <SelectItem value="sent">
            {t.formatMessage({ defaultMessage: "Sent" })}
          </SelectItem>
          <SelectItem value="not_sent">
            {t.formatMessage({ defaultMessage: "Not sent" })}
          </SelectItem>
        </SelectContent>
      </Select>
      {withSort && (
        <Select
          value={filters.sort}
          onValueChange={(sort) =>
            onChange({ ...filters, sort: sort as SortKey })
          }
        >
          <SelectTrigger
            size="sm"
            aria-label={t.formatMessage({ defaultMessage: "Sort by" })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="activity">
              {t.formatMessage({ defaultMessage: "Last activity" })}
            </SelectItem>
            <SelectItem value="sent">
              {t.formatMessage({ defaultMessage: "Sent date" })}
            </SelectItem>
            <SelectItem value="company">
              {t.formatMessage({ defaultMessage: "Company" })}
            </SelectItem>
            <SelectItem value="status">
              {t.formatMessage({ defaultMessage: "Status" })}
            </SelectItem>
          </SelectContent>
        </Select>
      )}
      {filtered && (
        <Button
          variant="link"
          size="sm"
          onClick={() => onChange({ ...defaultFilters, sort: filters.sort })}
        >
          {t.formatMessage({ defaultMessage: "Clear filters" })}
        </Button>
      )}
    </div>
  );
}

function ApplicationListRow({
  application,
}: {
  application: TrackedApplication;
}) {
  const t = useTranslation();
  const labels = useTrackerLabels();
  const openingLabels = useOpeningLabels();
  const typeNames = useTypeNames();
  return (
    <li>
      <Link
        href={`/app/openings/${application.openingId}`}
        className="bg-background hover:border-primary flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">
            {[application.company, application.title]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <span className="text-muted-foreground text-xs">
            {[
              application.appliedAt
                ? t.formatMessage(
                    { defaultMessage: "Sent {date}" },
                    {
                      date: t.formatDate(application.appliedAt, {
                        dateStyle: "medium",
                      }),
                    }
                  )
                : t.formatMessage({ defaultMessage: "Not sent" }),
              application.applicationType
                ? typeNames[application.applicationType]
                : null,
              application.source ? labels.source(application.source) : null,
              t.formatMessage(
                { defaultMessage: "Active {date}" },
                {
                  date: t.formatDate(application.lastActivityAt, {
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
          {application.fitBand && (
            <Badge variant="outline">
              {openingLabels.band(application.fitBand)}
            </Badge>
          )}
          {application.external && (
            <Badge variant="outline">
              {t.formatMessage({ defaultMessage: "Elsewhere" })}
            </Badge>
          )}
          <Badge variant="secondary">{labels.status(application.status)}</Badge>
        </span>
      </Link>
    </li>
  );
}
