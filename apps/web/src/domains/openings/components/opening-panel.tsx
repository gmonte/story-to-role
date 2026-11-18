"use client";

import { useSearchParams } from "next/navigation";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

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
import { useOpeningDocuments } from "~/domains/documents/hooks/use-opening-documents";
import { useSelectedVersion } from "~/domains/documents/hooks/use-selected-version";
import { WorkspaceBody } from "~/domains/workspace/components/workspace-body";

import { useOpening } from "../hooks/use-opening";
import { FitCheckPanel, pendingGaps } from "./fit-check-panel";
import { OpeningView } from "./opening-view";

/**
 * An opening's screen: the opening (or one of its documents in the
 * workspace) in the middle and, on the right, the application's tracker
 * with the fit check, or, while a document is open, that document's
 * preview and versions with the tracker below them.
 */
export function OpeningBody({ openingId }: { openingId: string }) {
  return (
    <DocumentAgentProvider>
      <WorkspaceBody
        layoutId="opening"
        chat={<OpeningView openingId={openingId} />}
        panel={<OpeningPanel openingId={openingId} />}
      />
    </DocumentAgentProvider>
  );
}

function OpeningPanel({ openingId }: { openingId: string }) {
  const t = useTranslation();
  const rowLabel = useVersionRowLabel();
  const opening = useOpening(openingId);
  const documents = useOpeningDocuments(openingId);
  const view = useSearchParams().get("view");
  const resume = documents.data?.documents.find((d) => d.kind === "resume");
  const letter = documents.data?.documents.find(
    (d) => d.kind === "cover_letter"
  );
  const resumeVersions = resume?.versions ?? [];
  const resumeSelection = useSelectedVersion(resumeVersions, "resume");
  const letterSelection = useSelectedVersion(letter?.versions ?? [], "letter");
  const data = opening.data;
  const analyzed = data?.status === "analyzed";
  const defaultLanguage = data?.language ?? "en-US";
  const defaultTone =
    documents.data?.application?.tone ?? data?.suggestedTone ?? "your_style";
  const tracker = <ApplicationTracker openingId={openingId} />;

  if (analyzed && view === "resume" && resume && resumeSelection.selected) {
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
              defaultLanguage={defaultLanguage}
              defaultTone={data.suggestedTone ?? "your_style"}
              pendingGaps={pendingGaps(data)}
              actions={(version) => (
                <VersionActions
                  version={version}
                  versions={resumeVersions}
                  onSelect={resumeSelection.select}
                  generateAgain={(row, trigger) => (
                    <GenerateResumeDialog
                      openingId={openingId}
                      defaultLanguage={row.language}
                      defaultTone={defaultTone}
                      versionId={row.id}
                      pendingGaps={pendingGaps(data)}
                      trigger={trigger}
                    />
                  )}
                />
              )}
            />
          }
        />
        {tracker}
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
                  defaultLanguage={defaultLanguage}
                  defaultTone={defaultTone}
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
                  defaultTone={defaultTone}
                  versionId={row.id}
                  trigger={trigger}
                />
              )}
            />
          }
        />
        {tracker}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {tracker}
      <FitCheckPanel openingId={openingId} />
    </div>
  );
}
