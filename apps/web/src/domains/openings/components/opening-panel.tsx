"use client";

import { useState } from "react";

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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/web/components/ui/tabs";

import { ApplicationTracker } from "~/domains/applications/components/application-tracker";
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
import { useDesktop } from "~/domains/workspace/hooks/use-desktop";

import { useOpening } from "../hooks/use-opening";
import {
  availableViews,
  type OpeningView as Step,
  resolveView,
} from "../utils/opening-journey";
import { FitSummary, pendingGaps } from "./fit-check-panel";
import { OpeningHeader, useOpeningJourney } from "./opening-header";
import { OpeningView } from "./opening-view";

/**
 * An opening's screen (workspace spec, "The opening page"): one header
 * with the journey's steps, the active step in the middle and, on the
 * right, a column that keeps its place in every step — the fit check and
 * the application as tabs, or, with a document open, that document's
 * side panel above them. Where the column has no room it opens as a
 * sheet.
 */
export function OpeningBody({ openingId }: { openingId: string }) {
  const t = useTranslation();
  const opening = useOpening(openingId);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const desktop = useDesktop();
  const [panelOpen, setPanelOpen] = useState(false);
  if (!opening.data) return null;
  const data = opening.data;
  const view = resolveView(
    searchParams.get("view"),
    availableViews({
      status: data.status,
      hasApplication: !!data.applicationId,
    })
  );
  const setView = (next: Step) => {
    const params = new URLSearchParams(searchParams);
    params.set("view", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setPanelOpen(false);
  };
  const panel = (
    <OpeningPanel
      openingId={openingId}
      opening={data}
      view={view}
      setView={setView}
    />
  );

  return (
    <DocumentAgentProvider>
      <div className="flex min-h-0 flex-1 flex-col">
        <OpeningHeader
          openingId={openingId}
          opening={data}
          view={view}
          setView={setView}
          onOpenPanel={() => setPanelOpen(true)}
        />
        <WorkspaceBody
          layoutId="opening"
          chat={
            <OpeningView
              openingId={openingId}
              opening={data}
              view={view}
              setView={setView}
            />
          }
          // One mount only: the column, or the sheet on a narrow screen.
          panel={desktop ? panel : undefined}
        />
        {!desktop && (
          <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
            <SheetContent className="w-[min(100vw,24rem)] overflow-y-auto p-4 pt-10">
              <SheetHeader className="sr-only">
                <SheetTitle>
                  {t.formatMessage({ defaultMessage: "Fit and application" })}
                </SheetTitle>
                <SheetDescription>
                  {t.formatMessage({
                    defaultMessage:
                      "The fit check and the application of this opening.",
                  })}
                </SheetDescription>
              </SheetHeader>
              {panel}
            </SheetContent>
          </Sheet>
        )}
      </div>
    </DocumentAgentProvider>
  );
}

/**
 * The right column: Fit and Application, in that order, in every step
 * (the Agent tab joins them with the opening agent); in a document step
 * the document's own panel sits above them.
 */
function OpeningPanel({
  openingId,
  opening,
  view,
  setView,
}: {
  openingId: string;
  opening: OpeningDetail;
  view: Step;
  setView: (view: Step) => void;
}) {
  const t = useTranslation();
  const rowLabel = useVersionRowLabel();
  const journey = useOpeningJourney(openingId, opening);
  const { resume, letter } = journey;
  const resumeVersions = resume?.versions ?? [];
  const resumeSelection = useSelectedVersion(resumeVersions, "resume");
  const letterSelection = useSelectedVersion(letter?.versions ?? [], "letter");
  const analyzed = opening.status === "analyzed";
  // The application starts with its first document; the tab says so.
  const [tab, setTab] = useState(
    opening.applicationId && view === "application" ? "application" : "fit"
  );

  const fixed = (
    <Tabs value={tab} onValueChange={setTab} className="gap-3">
      <TabsList className="w-full">
        <TabsTrigger value="fit" className="flex-1">
          {t.formatMessage({ defaultMessage: "Fit" })}
        </TabsTrigger>
        <TabsTrigger value="application" className="flex-1">
          {t.formatMessage({ defaultMessage: "Application" })}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="fit">
        <FitSummary opening={opening} onOpen={() => setView("fit")} />
      </TabsContent>
      <TabsContent value="application" className="flex flex-col gap-3">
        <ApplicationTracker openingId={openingId} />
        {view !== "application" && opening.applicationId && (
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() => setView("application")}
          >
            {t.formatMessage({ defaultMessage: "Open the Application step" })}
          </Button>
        )}
      </TabsContent>
    </Tabs>
  );

  if (
    analyzed &&
    view === "resume" &&
    resume &&
    resumeSelection.selected &&
    !journey.resumeGenerating
  ) {
    return (
      <div className="flex h-full flex-col gap-6">
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
        {fixed}
      </div>
    );
  }
  if (analyzed && view === "letter" && letter && letterSelection.selected) {
    return (
      <div className="flex h-full flex-col gap-6">
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
        {fixed}
      </div>
    );
  }
  return fixed;
}
