"use client";

import {
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  ExternalLink,
  FileText,
  GripVertical,
  TriangleAlert,
} from "lucide-react";

import type { OpeningDetail } from "@repo/api/domains/openings/schemas/opening-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Separator } from "@repo/web/components/ui/separator";

import { ApplicationContext } from "~/domains/applications/components/application-context";
import { ApplicationTracker } from "~/domains/applications/components/application-tracker";
import { CompanyResearch } from "~/domains/applications/components/company-research";
import { CoverLetterPrep } from "~/domains/applications/components/cover-letter-prep";
import { DownloadZipButton } from "~/domains/documents/components/download-zip-button";
import { useOpeningDocuments } from "~/domains/documents/hooks/use-opening-documents";
import { GenerateResumeDialog } from "~/domains/documents/components/generate-resume-dialog";
import { ResumeWorkspace } from "~/domains/documents/components/resume-workspace";
import { SimilarDocuments } from "~/domains/documents/components/similar-documents";
import { AiAtWork } from "~/domains/workspace/components/ai-at-work";
import { ResizableAside } from "~/domains/workspace/components/resizable-aside";

import { useOpening } from "../hooks/use-opening";
import { useOpeningLabels } from "../hooks/use-opening-labels";
import type {
  OpeningView as Page,
  PrimaryAction,
} from "../utils/opening-journey";
import { OpeningLinkSection } from "./opening-link-section";
import { DescriptionEditor } from "./description-editor";
import { FitColumn, pendingGaps } from "./fit-check-panel";
import { OpeningPhoneBar } from "./opening-phone-bar";
import type { useOpeningJourney } from "./opening-header";

/** How many columns the screen has room for. */
export type OpeningLayout = "three" | "two" | "stack" | "phone";

/**
 * The opening itself, on one screen (workspace spec, "The opening page"):
 * the fit on the left, the opening's description in the middle and the
 * application on the right (as an issue tracker's sidebar), each scrolling
 * on its own. Where there is no room
 * the application folds behind the header's button and the fit goes below
 * the description; on a phone everything stacks.
 */
const minFitWidth = 288;
const maxFitWidth = 720;

/**
 * A column the user widens or narrows by dragging its edge, remembered per
 * viewer (read after hydration, so server and client render the same).
 */
function useColumnWidth(key: string, fallback: number) {
  // The saved width, read from storage on the client (the server renders
  // the default); a drag overrides it until the next visit.
  const saved = useSyncExternalStore(
    () => () => undefined,
    () => {
      try {
        const stored = Number(window.localStorage.getItem(key));
        return stored >= minFitWidth && stored <= maxFitWidth
          ? stored
          : fallback;
      } catch {
        return fallback;
      }
    },
    () => fallback
  );
  const [dragged, setDragged] = useState<number | null>(null);
  const width = dragged ?? saved;

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const start = width;
    let latest = start;
    const onMove = (move: PointerEvent) => {
      latest = Math.min(
        maxFitWidth,
        Math.max(minFitWidth, start + move.clientX - startX)
      );
      setDragged(latest);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      try {
        window.localStorage.setItem(key, String(Math.round(latest)));
      } catch {
        // Not remembered this time.
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return { width, startResize };
}

export function OpeningPageBody({
  openingId,
  opening,
  layout,
  action = null,
  openView,
}: {
  openingId: string;
  opening: OpeningDetail;
  layout: OpeningLayout;
  /** The state's primary action, for the phone's bottom bar. */
  action?: PrimaryAction | null;
  openView?: (view: Exclude<Page, "opening">) => void;
}) {
  const worked = opening.status === "analyzed" || opening.status === "closed";
  const recheck = isRecheck(opening);
  const showFit = worked || recheck;
  // An opening registered without analysis can be applied to all the same.
  const showApplication =
    worked ||
    recheck ||
    opening.status === "unanalyzed" ||
    !!opening.applicationId;
  const description = <DescriptionColumn opening={opening} />;
  const fit = showFit && (
    <section id="fit-column">
      {recheck ? (
        <AnalysisProgress opening={opening} />
      ) : (
        <FitColumn opening={opening} />
      )}
    </section>
  );
  const application = showApplication && (
    <ApplicationColumn openingId={openingId} />
  );

  const { width: fitWidth, startResize: startFitResize } = useColumnWidth(
    "opening-fit-width",
    416
  );

  if (layout === "three") {
    return (
      <div className="flex min-h-0 flex-1">
        {fit && (
          <>
            <aside
              className="bg-muted/60 shrink-0 overflow-y-auto p-4"
              style={{ width: fitWidth }}
            >
              {fit}
            </aside>
            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={startFitResize}
              className="hover:bg-primary/20 flex w-1.5 shrink-0 cursor-col-resize touch-none items-center justify-center border-l"
            >
              <GripVertical className="text-muted-foreground size-3" />
            </div>
          </>
        )}
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
            {description}
          </div>
        </div>
        {application && (
          <aside
            id="application-column"
            className="bg-muted/60 w-80 shrink-0 overflow-y-auto border-l p-4"
          >
            {application}
          </aside>
        )}
      </div>
    );
  }

  // A phone: the description is the page; Fit and Application are sheets
  // behind the bottom bar.
  if (layout === "phone") {
    return (
      <>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
            {description}
          </div>
        </div>
        {(fit || application || action) && (
          <OpeningPhoneBar
            opening={opening}
            action={action}
            fit={fit}
            application={application}
            openView={openView ?? (() => undefined)}
          />
        )}
      </>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 sm:p-6">
        {/* Under `lg` the application is a block of the page; from `lg` it
            sits behind the header's button. */}
        {layout === "stack" && application && (
          <div id="application-column">{application}</div>
        )}
        {description}
        {fit}
      </div>
    </div>
  );
}

/**
 * The opening's application as the full tracker (tracker spec): its
 * status, "Mark as applied", what was sent and the next step, with the
 * details and the timeline folded.
 */
export function ApplicationColumn({ openingId }: { openingId: string }) {
  const t = useTranslation();
  const opening = useOpening(openingId);
  const documents = useOpeningDocuments(openingId);
  const versions = (documents.data?.documents ?? []).flatMap(
    (document) => document.versions
  );
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h2 className="font-medium">
        {t.formatMessage({ defaultMessage: "Application" })}
      </h2>
      <ApplicationTracker openingId={openingId} />
      {opening.data && (
        <OpeningLinkSection openingId={openingId} opening={opening.data} />
      )}
      {versions.length > 0 && (
        <section className="flex flex-col gap-1.5 border-t pt-3">
          <h3 className="text-muted-foreground text-xs font-medium">
            {t.formatMessage({ defaultMessage: "Files" })}
          </h3>
          <DownloadZipButton
            openingId={openingId}
            versions={versions}
            className="w-full"
          />
        </section>
      )}
    </div>
  );
}

/** A resume or a cover letter, full screen, without the application. */
export function DocumentPage({
  openingId,
  opening,
  page,
  journey,
}: {
  openingId: string;
  opening: OpeningDetail;
  page: Exclude<Page, "opening">;
  journey: ReturnType<typeof useOpeningJourney>;
}) {
  const t = useTranslation();
  // The application instructions the AI uses, where they apply.
  const instructions = opening.status !== "processing" && (
    <ApplicationContext openingId={openingId} />
  );

  if (page === "letter") {
    return (
      <CoverLetterPrep
        openingId={openingId}
        defaultLanguage={journey.language}
        defaultTone={journey.tone}
        aside={
          <>
            {instructions}
            <CompanyResearch
              openingId={openingId}
              hasCompany={!!opening.company}
            />
          </>
        }
      />
    );
  }

  const versions = journey.resume?.versions ?? [];
  if (versions.length > 0 || journey.resumeGenerating) {
    return (
      <ResumeWorkspace
        versions={versions}
        generation={journey.resume?.generation}
        aside={instructions}
      />
    );
  }
  return (
    <div className="flex min-h-0 flex-1">
      <ResizableAside
        storageKey="document-index-width"
        className="space-y-6 p-4"
      >
        {instructions}
      </ResizableAside>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
          <div className="flex flex-col gap-3">
            <h2 className="font-medium">
              {t.formatMessage({
                defaultMessage: "No resume for this opening yet.",
              })}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t.formatMessage({
                defaultMessage:
                  "The AI writes a resume for this opening from your published profile. You can generate it even with a low fit, and then review it line by line.",
              })}
            </p>
            {/* Its button stays away until the opening is reopened. */}
            {opening.status === "closed" && (
              <p className="text-muted-foreground text-sm">
                {t.formatMessage({
                  defaultMessage: "Reopen the opening to generate one.",
                })}
              </p>
            )}
            {journey.resume?.generation?.status === "failed" && (
              <p className="border-destructive/40 bg-destructive/10 rounded-lg border p-2.5 text-xs">
                {t.formatMessage({
                  defaultMessage: "The last generation failed. Try again.",
                })}
              </p>
            )}
            {journey.documents.data && (
              <GenerateResumeDialog
                openingId={openingId}
                defaultLanguage={journey.language}
                defaultTone={journey.tone}
                pendingGaps={pendingGaps(opening)}
                existingLanguages={[]}
                application={journey.application}
                trigger={
                  <Button className="self-start">
                    <FileText />
                    {t.formatMessage({ defaultMessage: "Generate resume" })}
                  </Button>
                }
              />
            )}
          </div>
          {/* Adjusting one of them writes a resume too. */}
          {opening.status !== "closed" && (
            <SimilarDocuments
              separator={
                <div className="text-muted-foreground flex items-center gap-3 text-xs">
                  <Separator className="flex-1" />
                  {t.formatMessage({ defaultMessage: "or" })}
                  <Separator className="flex-1" />
                </div>
              }
              openingId={openingId}
              defaultLanguage={journey.language}
              defaultTone={journey.tone}
              pendingGaps={pendingGaps(opening)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The description column: the method's warning signs marked above what
 * the person pasted (or the analysis' progress while it runs).
 */
function DescriptionColumn({ opening }: { opening: OpeningDetail }) {
  // A first analysis fills the page; a re-check runs in the fit column and
  // leaves the description where it is.
  if (opening.status === "processing" && !isRecheck(opening)) {
    return (
      <div className="mx-auto w-full max-w-md py-6">
        <AnalysisProgress opening={opening} />
      </div>
    );
  }

  return <DescriptionBody opening={opening} />;
}

/** A re-check: the opening was analyzed before and is being checked again. */
export function isRecheck(opening: OpeningDetail) {
  return opening.status === "processing" && !!opening.fitCheck;
}

/** The analysis' live steps (reading, listing, matching, judging). */
function AnalysisProgress({ opening }: { opening: OpeningDetail }) {
  const t = useTranslation();
  const found = opening.progress?.counts;
  return (
    <AiAtWork
      title={t.formatMessage({
        defaultMessage: "Reading the opening and checking your fit",
      })}
      current={opening.progress?.label ?? "reading"}
      steps={[
        {
          key: "reading",
          label: t.formatMessage({ defaultMessage: "Reading the opening" }),
        },
        {
          key: "requirements",
          label: t.formatMessage({
            defaultMessage: "Listing what it asks for",
          }),
        },
        {
          key: "matching",
          label: t.formatMessage({
            defaultMessage:
              "Looking for the passages of your profile behind each point",
          }),
        },
        {
          key: "judging",
          label: t.formatMessage({
            defaultMessage: "Weighing what you have against each one",
          }),
        },
      ]}
      detail={
        found?.requirements !== undefined &&
        t.formatMessage(
          {
            defaultMessage: "It asks for {keywords} and {requirements}.",
          },
          {
            keywords: t.formatMessage(
              {
                defaultMessage:
                  "{keywords, plural, =0 {no listed skills} one {# skill} other {# skills}}",
              },
              { keywords: found.keywords ?? 0 }
            ),
            requirements: t.formatMessage(
              {
                defaultMessage:
                  "{requirements, plural, =0 {no other requirements} one {# requirement} other {# requirements}}",
              },
              { requirements: found.requirements }
            ),
          }
        )
      }
      note={t.formatMessage({
        defaultMessage: "You can leave this page; the result will be here.",
      })}
    />
  );
}

function DescriptionBody({ opening }: { opening: OpeningDetail }) {
  const t = useTranslation();
  const labels = useOpeningLabels();
  return (
    <>
      {opening.status === "unanalyzed" && (
        <div className="bg-card flex flex-col gap-2 rounded-lg border p-4 text-sm">
          <p>
            {t.formatMessage({
              defaultMessage:
                "This opening was added without analysis. Analyze it to see your fit and write documents for it; you can apply to it and track it either way.",
            })}
          </p>
          {!opening.description && !opening.sourceUrl && (
            <p className="text-muted-foreground">
              {t.formatMessage({
                defaultMessage: "Paste its description below to analyze it.",
              })}
            </p>
          )}
        </div>
      )}

      {opening.status === "failed" && (
        <div className="border-warning-border bg-warning-soft flex gap-2 rounded-lg border p-4 text-sm">
          <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" />
          <p>
            {t.formatMessage({
              defaultMessage:
                "The analysis didn’t finish, and no credits were used. Try again to read the opening from the start.",
            })}
          </p>
        </div>
      )}

      {opening.status === "rejected" && (
        <div className="border-warning-border bg-warning-soft rounded-lg border p-4 text-sm">
          <p>{labels.rejection(opening.rejectionReason)}</p>
        </div>
      )}

      {opening.warnings.length > 0 && (
        <div className="border-warning-border bg-warning-soft flex gap-2 rounded-lg border p-3 text-sm">
          <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col gap-1">
            <p className="font-medium">
              {t.formatMessage({
                defaultMessage: "Warning signs in this opening",
              })}
            </p>
            <ul className="flex flex-col gap-1">
              {opening.warnings.map((warning) => (
                <li key={warning}>{labels.warning(warning)}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {opening.description === null && opening.notes ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">
            {t.formatMessage({ defaultMessage: "Notes" })}
          </h2>
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">
            {opening.notes}
          </p>
        </section>
      ) : (
        <DescriptionEditor
          openingId={opening.id}
          initial={opening.description ?? ""}
        />
      )}

      {opening.sourceUrl && (
        <a
          href={opening.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-muted-foreground inline-flex items-center gap-1 text-sm underline"
        >
          <ExternalLink className="size-3.5" />
          {t.formatMessage({ defaultMessage: "Opening text" })}
        </a>
      )}
    </>
  );
}
