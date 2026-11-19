"use client";

import { useState, type ReactNode } from "react";

import { useMutation } from "@tanstack/react-query";
import {
  Ban,
  Briefcase,
  Mail,
  Pencil,
  Ellipsis,
  ExternalLink,
  FileText,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import type { OpeningDetail } from "@repo/api/domains/openings/schemas/opening-view";
import type { DocumentView } from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { Input } from "@repo/web/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/web/components/ui/dropdown-menu";
import { toast } from "@repo/web/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/web/components/ui/tooltip";
import { cn } from "@repo/web/lib/utils";

import { useTrackerLabels } from "~/domains/applications/hooks/use-tracker-labels";
import { CreditCost } from "~/domains/credits/components/credit-cost";
import { useCredits } from "~/domains/credits/hooks/use-credits";
import { useOpeningDocuments } from "~/domains/documents/hooks/use-opening-documents";
import { useTRPC } from "~/tools/trpc/client";

import { useRefreshOpenings } from "../hooks/use-opening";
import { useOpeningLabels } from "../hooks/use-opening-labels";
import {
  availableViews,
  type OpeningView,
  openingViews,
  type PrimaryAction,
  primaryAction,
} from "../utils/opening-journey";
import {
  bandClassName,
  pendingGaps,
  useExcludeCompany,
} from "./fit-check-panel";

/** The documents of an opening the header and the steps both read. */
export function useOpeningJourney(openingId: string, opening: OpeningDetail) {
  const documents = useOpeningDocuments(openingId);
  const resume = documents.data?.documents.find((d) => d.kind === "resume");
  const letter = documents.data?.documents.find(
    (d) => d.kind === "cover_letter"
  );
  const generating = (document?: DocumentView) =>
    document?.generation?.status === "pending" ||
    document?.generation?.status === "running";
  const application = documents.data?.application ?? null;
  return {
    documents,
    resume,
    letter,
    application,
    resumeGenerating: generating(resume),
    letterGenerating: generating(letter),
    tone: application?.tone ?? opening.suggestedTone ?? "your_style",
    language: opening.language ?? "en-US",
    action: primaryAction({
      status: opening.status,
      kind: opening.kind,
      needsPublishedProfile: opening.needsPublishedProfile,
      pendingGaps: pendingGaps(opening),
      resumeVersions: resume?.versions.length ?? 0,
      resumeGenerating: generating(resume),
      letterVersions: letter?.versions.length ?? 0,
      letterGenerating: generating(letter),
      applicationStatus: opening.applicationStatus,
    }),
    views: availableViews({ status: opening.status }),
  };
}

/** What the header's side button opens, where there is no room beside. */
export type SideButton = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
};

/**
 * The opening pages' header (workspace spec, "The opening page"), the same
 * on the opening, resume and cover letter pages, as a GitHub issue's: the
 * title, the state chips, the rare actions in a menu, one primary action
 * for the state, and the tabs between the pages below.
 */
export function OpeningHeader({
  openingId,
  opening,
  view,
  setView,
  sideButton,
}: {
  openingId: string;
  opening: OpeningDetail;
  view: OpeningView;
  setView: (view: OpeningView) => void;
  /** Opens the column that has no room beside the page. */
  sideButton?: SideButton;
}) {
  const t = useTranslation();
  const labels = useOpeningLabels();
  const trackerLabels = useTrackerLabels();
  const journey = useOpeningJourney(openingId, opening);
  const processing = opening.status === "processing";
  const stepLabels: Record<OpeningView, string> = {
    opening: t.formatMessage({ defaultMessage: "Opening" }),
    resume: t.formatMessage({ defaultMessage: "Resume" }),
    letter: t.formatMessage({ defaultMessage: "Cover letter" }),
  };
  const stepHints: Partial<Record<OpeningView, string | number>> = {
    resume: journey.resumeGenerating
      ? "…"
      : (journey.resume?.versions.length ?? ""),
    letter: journey.letterGenerating
      ? "…"
      : (journey.letter?.versions.length ?? ""),
  };
  // Tabs as a GitHub issue's: an icon, the label and a count, the open one
  // as a tab joined to the line below.
  const stepIcons: Record<OpeningView, ReactNode> = {
    opening: <Briefcase className="size-4" />,
    resume: <FileText className="size-4" />,
    letter: <Mail className="size-4" />,
  };
  const switcher = journey.views.length > 1 && (
    <nav className="-mb-px flex items-end gap-1 overflow-x-auto">
      {openingViews.map((step) => {
        const enabled = journey.views.includes(step);
        const active = view === step;
        const hint = stepHints[step];
        return (
          <button
            key={step}
            type="button"
            disabled={!enabled}
            aria-current={active ? "page" : undefined}
            onClick={() => setView(step)}
            className={cn(
              "text-muted-foreground flex shrink-0 items-center gap-2 rounded-t-md border border-transparent px-4 py-2 text-sm transition-colors",
              enabled && "hover:text-foreground",
              !enabled && "opacity-50",
              active &&
                "bg-background text-foreground border-border border-b-background font-medium"
            )}
          >
            {stepIcons[step]}
            {stepLabels[step]}
            {hint !== "" && hint !== undefined && (
              <span className="bg-muted text-foreground rounded-full px-2 text-xs font-medium">
                {hint}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
  const sideTrigger = sideButton && (
    <Button
      size="sm"
      variant="outline"
      onClick={sideButton.onClick}
      aria-label={sideButton.label}
    >
      {sideButton.icon}
      <span className="hidden sm:inline">{sideButton.label}</span>
    </Button>
  );

  // The same header on the opening, resume and cover letter pages (owner):
  // the document pages differ only below it.
  return (
    <div className="bg-background/95 z-10 flex shrink-0 flex-col gap-3 border-b px-4 pt-4 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        {/* On a narrow screen the actions wrap under the title. */}
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
          {processing && !opening.title ? (
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {t.formatMessage({ defaultMessage: "Reading the opening…" })}
            </h1>
          ) : (
            <OpeningTitle openingId={openingId} opening={opening} />
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {opening.company && (
              <p className="text-muted-foreground text-sm">{opening.company}</p>
            )}
            {opening.fitCheck && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={cn(
                      "cursor-default",
                      bandClassName(opening.fitCheck.band)
                    )}
                  >
                    {labels.band(opening.fitCheck.band)}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {t.formatMessage({
                    defaultMessage:
                      "A hint from your published profile. You can apply whatever it says.",
                  })}
                </TooltipContent>
              </Tooltip>
            )}
            {opening.applicationStatus && (
              <Badge variant="secondary">
                {trackerLabels.status(opening.applicationStatus)}
              </Badge>
            )}
            {opening.status === "closed" && (
              <Badge variant="outline">
                {t.formatMessage({ defaultMessage: "Closed" })}
              </Badge>
            )}
            {opening.kind === "unsolicited" && (
              <Badge variant="outline">
                {t.formatMessage({ defaultMessage: "No vacancy" })}
              </Badge>
            )}
            {opening.suggestedTone && (
              <Badge variant="outline" className="text-muted-foreground">
                {t.formatMessage(
                  { defaultMessage: "Tone: {tone}" },
                  { tone: labels.tone(opening.suggestedTone) }
                )}
              </Badge>
            )}
            {opening.warnings.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="cursor-default border-amber-500/40 bg-amber-500/10"
                  >
                    <TriangleAlert className="size-3" />
                    {t.formatMessage(
                      {
                        defaultMessage:
                          "{count, plural, =0 {no warning signs} one {# warning sign} other {# warning signs}}",
                      },
                      { count: opening.warnings.length }
                    )}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <ul className="flex flex-col gap-1">
                    {opening.warnings.map((warning) => (
                      <li key={warning}>{labels.warning(warning)}</li>
                    ))}
                  </ul>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sideTrigger}
          <PrimaryActionButton
            action={journey.action}
            openingId={openingId}
            opening={opening}
            journey={journey}
          />
          <OpeningMenu openingId={openingId} opening={opening} />
        </div>
      </div>
      {switcher}
    </div>
  );
}

/** The one button that says what comes next (design review, table). */
function PrimaryActionButton({
  action,
  openingId,
  opening,
  journey,
}: {
  action: PrimaryAction | null;
  openingId: string;
  opening: OpeningDetail;
  journey: ReturnType<typeof useOpeningJourney>;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshOpenings();
  const credits = useCredits();
  const analyze = useMutation(
    trpc.openings.analyzeExternal.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );
  const setClosed = useMutation(
    trpc.openings.setClosed.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );

  // The tabs, the fit column and the application column already offer the
  // next steps (owner): the header keeps only actions found nowhere else.
  if (
    action === "answer_questions" ||
    action === "generate_resume" ||
    action === "write_letter" ||
    action === "mark_applied" ||
    action === "record_reply"
  ) {
    return null;
  }

  switch (action) {
    case null:
      return journey.resumeGenerating || journey.letterGenerating ? (
        <Button size="sm" variant="outline" disabled>
          <Loader2 className="animate-spin" />
          {journey.resumeGenerating
            ? t.formatMessage({ defaultMessage: "Writing the resume…" })
            : t.formatMessage({ defaultMessage: "Writing the letter…" })}
        </Button>
      ) : null;
    case "go_to_career":
      return (
        <Button asChild size="sm">
          <Link href="/app/career">
            {t.formatMessage({ defaultMessage: "Go to My career" })}
          </Link>
        </Button>
      );
    case "reopen":
      return (
        <Button
          size="sm"
          disabled={setClosed.isPending}
          onClick={() => setClosed.mutate({ openingId, closed: false })}
        >
          {t.formatMessage({ defaultMessage: "Reopen" })}
        </Button>
      );
    case "analyze":
      if (!opening.description && !opening.sourceUrl) return null;
      return (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={analyze.isPending}
            onClick={() => analyze.mutate({ openingId })}
          >
            {t.formatMessage({ defaultMessage: "Analyze this opening" })}
          </Button>
          <CreditCost credits={credits.data?.estimates.fitCheck} />
        </div>
      );
    case "add_again":
      return (
        <Button asChild size="sm">
          <Link href="/app/openings/new">
            {t.formatMessage({ defaultMessage: "Add it again" })}
          </Link>
        </Button>
      );
  }
}

/** The rare actions: closing the opening, excluding its company. */
function OpeningMenu({
  openingId,
  opening,
}: {
  openingId: string;
  opening: OpeningDetail;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshOpenings();
  const setClosed = useMutation(
    trpc.openings.setClosed.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );
  const excludeCompany = useExcludeCompany(openingId, opening.company);
  const canClose = opening.status === "analyzed" || opening.status === "closed";
  const canExclude = opening.status === "analyzed" && !!opening.company;
  if (!canClose && !canExclude && !opening.sourceUrl) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="outline"
          aria-label={t.formatMessage({ defaultMessage: "More actions" })}
        >
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {opening.sourceUrl && (
          <DropdownMenuItem asChild>
            <a
              href={opening.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              <ExternalLink />
              {t.formatMessage({ defaultMessage: "Open the opening’s page" })}
            </a>
          </DropdownMenuItem>
        )}
        {canClose && (
          <DropdownMenuItem
            disabled={setClosed.isPending}
            onSelect={() =>
              setClosed.mutate({
                openingId,
                closed: opening.status !== "closed",
              })
            }
          >
            {opening.status === "closed"
              ? t.formatMessage({ defaultMessage: "Reopen the opening" })
              : t.formatMessage({ defaultMessage: "Close the opening" })}
          </DropdownMenuItem>
        )}
        {canExclude && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={excludeCompany.disabled}
              onSelect={excludeCompany.exclude}
            >
              <Ban />
              {t.formatMessage(
                { defaultMessage: "Never recommend {company} again" },
                { company: opening.company }
              )}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The opening's title, renamed in place as a GitHub issue's: the pencil
 * opens the title and company for editing; Enter saves, Escape cancels.
 */
function OpeningTitle({
  openingId,
  opening,
}: {
  openingId: string;
  opening: OpeningDetail;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshOpenings();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const rename = useMutation(
    trpc.openings.rename.mutationOptions({
      onSuccess: async () => {
        await refresh();
        setEditing(false);
      },
      onError: (error) => toast.error(error.message),
    })
  );
  const shown = opening.title ?? t.formatMessage({ defaultMessage: "Opening" });

  function start() {
    setTitle(opening.title ?? "");
    setCompany(opening.company ?? "");
    setEditing(true);
  }
  function save() {
    if (!title.trim()) return;
    rename.mutate({ openingId, title: title.trim(), company: company.trim() });
  }

  if (!editing) {
    return (
      <div className="group flex items-start gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {shown}
        </h1>
        <Button
          size="icon"
          variant="ghost"
          className="text-muted-foreground mt-1 size-7 shrink-0"
          aria-label={t.formatMessage({ defaultMessage: "Edit title" })}
          title={t.formatMessage({ defaultMessage: "Edit title" })}
          onClick={start}
        >
          <Pencil />
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setEditing(false);
      }}
    >
      <Input
        autoFocus
        value={title}
        maxLength={200}
        onChange={(event) => setTitle(event.target.value)}
        aria-label={t.formatMessage({ defaultMessage: "Title" })}
        className="h-10 text-lg font-semibold"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={company}
          maxLength={200}
          onChange={(event) => setCompany(event.target.value)}
          placeholder={t.formatMessage({ defaultMessage: "Company" })}
          aria-label={t.formatMessage({ defaultMessage: "Company" })}
          className="h-8 max-w-xs text-sm"
        />
        <Button
          size="sm"
          type="submit"
          disabled={!title.trim() || rename.isPending}
        >
          {t.formatMessage({ defaultMessage: "Save" })}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          onClick={() => setEditing(false)}
        >
          {t.formatMessage({ defaultMessage: "Cancel" })}
        </Button>
      </div>
    </form>
  );
}
