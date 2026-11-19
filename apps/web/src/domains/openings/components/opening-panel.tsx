"use client";

import { useEffect, useRef, useState } from "react";

import { PanelRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { OpeningDetail } from "@repo/api/domains/openings/schemas/opening-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/web/components/ui/sheet";

import { DocumentAgent } from "~/domains/documents/components/document-agent";
import { DocumentAgentProvider } from "~/domains/documents/components/document-agent-context";
import {
  DocumentSidePanel,
  useVersionRowLabel,
  VersionActions,
  VersionsBlock,
} from "~/domains/documents/components/document-side-panel";
import { DocumentsPanel } from "~/domains/documents/components/documents-panel";
import { GenerateLetterDialog } from "~/domains/documents/components/generate-letter-dialog";
import { GenerateResumeDialog } from "~/domains/documents/components/generate-resume-dialog";
import { useSelectedVersion } from "~/domains/documents/hooks/use-selected-version";
import { WorkspaceBody } from "~/domains/workspace/components/workspace-body";
import { useDesktop, useWide } from "~/domains/workspace/hooks/use-desktop";

import { useOpening, useRefreshOpenings } from "../hooks/use-opening";
import {
  availableViews,
  type OpeningView as Page,
  resolveView,
} from "../utils/opening-journey";
import { pendingGaps } from "./fit-check-panel";
import { OpeningHeader, useOpeningJourney } from "./opening-header";
import {
  ApplicationColumn,
  DocumentPage,
  OpeningPageBody,
  type OpeningLayout,
} from "./opening-view";

/**
 * An opening's pages (workspace spec, "The opening page"): the opening
 * itself on one screen with three columns, and the resume and the cover
 * letter as full-screen pages of their own, all under one header with the
 * switch between them.
 */
export function OpeningBody({ openingId }: { openingId: string }) {
  const opening = useOpening(openingId);
  if (!opening.data) return null;
  return <OpeningScreen openingId={openingId} opening={opening.data} />;
}

function OpeningScreen({
  openingId,
  opening,
}: {
  openingId: string;
  opening: OpeningDetail;
}) {
  const t = useTranslation();
  const refresh = useRefreshOpenings();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const desktop = useDesktop();
  const wide = useWide();
  const journey = useOpeningJourney(openingId, opening);
  const [sheetOpen, setSheetOpen] = useState(false);
  const view = resolveView(
    searchParams.get("view"),
    availableViews({ status: opening.status })
  );
  const setView = (next: Page) => {
    const params = new URLSearchParams(searchParams);
    params.set("view", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setSheetOpen(false);
  };

  // The sidebar's list learns the title once the analysis ends.
  const status = opening.status;
  useEffect(() => {
    if (status !== "processing") void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // A generation just started opens its page: the progress is the page.
  const wasGenerating = useRef({ resume: false, letter: false });
  useEffect(() => {
    const previous = wasGenerating.current;
    if (journey.resumeGenerating && !previous.resume) setView("resume");
    if (journey.letterGenerating && !previous.letter) setView("letter");
    wasGenerating.current = {
      resume: journey.resumeGenerating,
      letter: journey.letterGenerating,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey.resumeGenerating, journey.letterGenerating]);

  const layout: OpeningLayout = wide ? "three" : desktop ? "two" : "stack";
  const worked = opening.status === "analyzed" || opening.status === "closed";
  // The application folds behind the header's button between `lg` and
  // `xl`; under `lg` it is a block of the page.
  const applicationFolded =
    view === "opening" &&
    layout === "two" &&
    (worked || !!opening.applicationId);
  const hasDocumentPanel =
    worked &&
    ((view === "resume" &&
      !journey.resumeGenerating &&
      (journey.resume?.versions.length ?? 0) > 0) ||
      (view === "letter" && (journey.letter?.versions.length ?? 0) > 0));
  const documentColumn = hasDocumentPanel && (
    <DocumentColumn
      openingId={openingId}
      opening={opening}
      view={view}
      journey={journey}
    />
  );

  const sideButton = applicationFolded
    ? {
        label: t.formatMessage({ defaultMessage: "Application" }),
        icon: <PanelRight />,
        onClick: () => setSheetOpen(true),
      }
    : view !== "opening" && !desktop && hasDocumentPanel
      ? {
          label: t.formatMessage({ defaultMessage: "Agent and versions" }),
          icon: <PanelRight />,
          onClick: () => setSheetOpen(true),
        }
      : undefined;

  return (
    <DocumentAgentProvider>
      <div className="flex min-h-0 flex-1 flex-col">
        <OpeningHeader
          openingId={openingId}
          opening={opening}
          view={view}
          setView={setView}
          sideButton={sideButton}
        />
        {view === "opening" ? (
          <OpeningPageBody
            openingId={openingId}
            opening={opening}
            layout={layout}
          />
        ) : (
          <WorkspaceBody
            layoutId="opening-documents"
            chat={
              <DocumentPage
                openingId={openingId}
                opening={opening}
                page={view}
                journey={journey}
              />
            }
            // One mount only: the column, or the sheet on a narrow screen.
            panel={desktop ? documentColumn || undefined : undefined}
          />
        )}
        {sideButton && (
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent className="w-[min(100vw,24rem)] overflow-y-auto p-4 pt-10">
              <SheetHeader className="sr-only">
                <SheetTitle>{sideButton.label}</SheetTitle>
                <SheetDescription>{sideButton.label}</SheetDescription>
              </SheetHeader>
              {applicationFolded ? (
                <ApplicationColumn openingId={openingId} />
              ) : (
                documentColumn
              )}
            </SheetContent>
          </Sheet>
        )}
      </div>
    </DocumentAgentProvider>
  );
}

/**
 * The document pages' right column: the agent, the preview and the
 * versions of the selected document (no application controls here).
 */
function DocumentColumn({
  openingId,
  opening,
  view,
  journey,
}: {
  openingId: string;
  opening: OpeningDetail;
  view: Page;
  journey: ReturnType<typeof useOpeningJourney>;
}) {
  const t = useTranslation();
  const rowLabel = useVersionRowLabel();
  const { resume, letter } = journey;
  const resumeVersions = resume?.versions ?? [];
  const resumeSelection = useSelectedVersion(resumeVersions, "resume");
  const letterSelection = useSelectedVersion(letter?.versions ?? [], "letter");

  if (view === "resume" && resume && resumeSelection.selected) {
    return (
      <DocumentSidePanel
        version={resumeSelection.selected}
        agent={
          <DocumentAgent
            documentId={resume.id}
            kind="resume"
            version={resumeSelection.selected}
          />
        }
        versions={
          <DocumentsPanel
            openingId={openingId}
            defaultLanguage={journey.language}
            defaultTone={opening.suggestedTone ?? "your_style"}
            pendingGaps={pendingGaps(opening)}
            actions={(version) => (
              <VersionActions
                version={version}
                versions={resumeVersions}
                onSelect={resumeSelection.select}
                generateAgain={(row, trigger) => (
                  <GenerateResumeDialog
                    openingId={openingId}
                    defaultLanguage={row.language}
                    defaultTone={journey.tone}
                    versionId={row.id}
                    pendingGaps={pendingGaps(opening)}
                    trigger={trigger}
                  />
                )}
              />
            )}
          />
        }
      />
    );
  }
  if (view === "letter" && letter && letterSelection.selected) {
    return (
      <DocumentSidePanel
        version={letterSelection.selected}
        agent={
          <DocumentAgent
            documentId={letter.id}
            kind="cover_letter"
            version={letterSelection.selected}
          />
        }
        versions={
          <VersionsBlock
            document={letter}
            version={letterSelection.selected}
            select={letterSelection.select}
            label={rowLabel("cover_letter")}
            newVersion={
              <GenerateLetterDialog
                openingId={openingId}
                resumeVersions={resumeVersions}
                defaultLanguage={journey.language}
                defaultTone={journey.tone}
                trigger={
                  <Button size="sm" variant="ghost">
                    {t.formatMessage({ defaultMessage: "New version" })}
                  </Button>
                }
              />
            }
            generateAgain={(row, trigger) => (
              <GenerateLetterDialog
                openingId={openingId}
                resumeVersions={resumeVersions}
                defaultLanguage={row.language}
                defaultTone={journey.tone}
                versionId={row.id}
                trigger={trigger}
              />
            )}
          />
        }
      />
    );
  }
  return null;
}
