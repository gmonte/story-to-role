"use client";

import { useMutation } from "@tanstack/react-query";
import {
  Ban,
  Ellipsis,
  ExternalLink,
  FileText,
  Loader2,
  PanelRight,
  Send,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import type { OpeningDetail } from "@repo/api/domains/openings/schemas/opening-view";
import type { DocumentView } from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/web/components/ui/dropdown-menu";
import { toast } from "@repo/web/components/ui/sonner";
import { Tabs, TabsList, TabsTrigger } from "@repo/web/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/web/components/ui/tooltip";
import { cn } from "@repo/web/lib/utils";

import { MarkAppliedDialog } from "~/domains/applications/components/application-tracker";
import { useTrackerLabels } from "~/domains/applications/hooks/use-tracker-labels";
import { CreditCost } from "~/domains/credits/components/credit-cost";
import { useCredits } from "~/domains/credits/hooks/use-credits";
import { GenerateResumeDialog } from "~/domains/documents/components/generate-resume-dialog";
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
    views: availableViews({
      status: opening.status,
      hasApplication: !!opening.applicationId,
    }),
  };
}

/**
 * The opening page's header (workspace spec, "The opening page"): the
 * title and company, the state chips, the rare actions in a menu, one
 * primary action for the state, and the journey's steps as tabs.
 */
export function OpeningHeader({
  openingId,
  opening,
  view,
  setView,
  onOpenPanel,
}: {
  openingId: string;
  opening: OpeningDetail;
  view: OpeningView;
  setView: (view: OpeningView) => void;
  /** Opens the right column where there is no room for it. */
  onOpenPanel: () => void;
}) {
  const t = useTranslation();
  const labels = useOpeningLabels();
  const trackerLabels = useTrackerLabels();
  const journey = useOpeningJourney(openingId, opening);
  const pending = pendingGaps(opening);
  const processing = opening.status === "processing";
  const stepLabels: Record<OpeningView, string> = {
    opening: t.formatMessage({ defaultMessage: "Opening" }),
    fit: t.formatMessage({ defaultMessage: "Fit" }),
    resume: t.formatMessage({ defaultMessage: "Resume" }),
    letter: t.formatMessage({ defaultMessage: "Cover letter" }),
    application: t.formatMessage({ defaultMessage: "Application" }),
  };
  const stepHints: Partial<Record<OpeningView, string | number>> = {
    fit: pending > 0 ? pending : "",
    resume: journey.resumeGenerating
      ? "…"
      : (journey.resume?.versions.length ?? ""),
    letter: journey.letterGenerating
      ? "…"
      : (journey.letter?.versions.length ?? ""),
  };

  return (
    <div className="bg-background/95 z-10 flex shrink-0 flex-col gap-2 border-b px-4 pt-3 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-xl font-semibold tracking-tight">
            {processing
              ? t.formatMessage({ defaultMessage: "Reading the opening…" })
              : (opening.title ??
                t.formatMessage({ defaultMessage: "Opening" }))}
          </h1>
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
        <div className="flex items-center gap-2">
          <PrimaryActionButton
            action={journey.action}
            openingId={openingId}
            opening={opening}
            journey={journey}
            setView={setView}
          />
          <OpeningMenu openingId={openingId} opening={opening} />
          <Button
            size="icon"
            variant="outline"
            className="lg:hidden"
            aria-label={t.formatMessage({
              defaultMessage: "Fit and application",
            })}
            onClick={onOpenPanel}
          >
            <PanelRight />
          </Button>
        </div>
      </div>
      <Tabs
        value={view}
        onValueChange={(next) => setView(next as OpeningView)}
        className="-mx-4 overflow-x-auto px-4"
      >
        <TabsList className="bg-transparent p-0">
          {openingViews.map((step) => (
            <TabsTrigger
              key={step}
              value={step}
              disabled={!journey.views.includes(step)}
              className="data-[state=active]:bg-muted gap-1.5"
            >
              {stepLabels[step]}
              {stepHints[step] !== "" && stepHints[step] !== undefined && (
                <span className="text-muted-foreground text-[11px]">
                  {stepHints[step]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

/** The one button that says what comes next (design review, table). */
function PrimaryActionButton({
  action,
  openingId,
  opening,
  journey,
  setView,
}: {
  action: PrimaryAction | null;
  openingId: string;
  opening: OpeningDetail;
  journey: ReturnType<typeof useOpeningJourney>;
  setView: (view: OpeningView) => void;
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
  const pending = pendingGaps(opening);

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
    case "answer_questions":
      return (
        <Button size="sm" onClick={() => setView("fit")}>
          {t.formatMessage(
            {
              defaultMessage:
                "Answer {count, plural, =0 {no questions} one {# question} other {# questions}}",
            },
            { count: pending }
          )}
        </Button>
      );
    case "generate_resume":
      // Its section choices start from the application's, once loaded.
      if (!journey.documents.data) return null;
      return (
        <GenerateResumeDialog
          openingId={openingId}
          defaultLanguage={journey.language}
          defaultTone={journey.tone}
          pendingGaps={pending}
          existingLanguages={[]}
          application={journey.application}
          trigger={
            <Button size="sm">
              <FileText />
              {t.formatMessage({ defaultMessage: "Generate resume" })}
            </Button>
          }
        />
      );
    case "write_letter":
      return (
        <Button size="sm" onClick={() => setView("letter")}>
          {t.formatMessage({ defaultMessage: "Write the cover letter" })}
        </Button>
      );
    case "mark_applied":
      if (!opening.applicationId) return null;
      return (
        <MarkAppliedDialog
          applicationId={opening.applicationId}
          openingId={openingId}
          trigger={
            <Button size="sm">
              <Send />
              {t.formatMessage({ defaultMessage: "Mark as applied" })}
            </Button>
          }
        />
      );
    case "record_reply":
      return (
        <Button size="sm" onClick={() => setView("application")}>
          {t.formatMessage({ defaultMessage: "Record what happened" })}
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
