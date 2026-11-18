"use client";

import { Plus } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { WorkspaceBody } from "~/domains/workspace/components/workspace-body";

import { useLibraryDocument } from "../hooks/use-library";
import { useSelectedVersion } from "../hooks/use-selected-version";
import { AdaptVersionDialog } from "./adapt-version-dialog";
import { DocumentAgent } from "./document-agent";
import { DocumentAgentProvider } from "./document-agent-context";
import {
  DocumentSidePanel,
  useVersionRowLabel,
  VersionsBlock,
} from "./document-side-panel";
import { GenerationProgress } from "./documents-panel";
import { LinkedinDialog } from "./linkedin-dialog";
import { LinkedinEditor } from "./linkedin-editor";
import { LibraryResumeDialog } from "./library-resume-dialog";
import { ResumeWorkspace } from "./resume-workspace";

/** A library document's screen: the workspace and its side panel. */
export function LibraryDocumentBody({ documentId }: { documentId: string }) {
  return (
    <DocumentAgentProvider>
      <WorkspaceBody
        layoutId="library-document"
        chat={<LibraryDocumentView documentId={documentId} />}
        panel={<LibraryDocumentPanel documentId={documentId} />}
      />
    </DocumentAgentProvider>
  );
}

/** A library document in the editor, as an application's resume would be. */
export function LibraryDocumentView({ documentId }: { documentId: string }) {
  const t = useTranslation();
  const document = useLibraryDocument(documentId);
  const generation = document.data?.generation;
  const running =
    generation?.status === "pending" || generation?.status === "running";
  const versions = document.data?.versions ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {running && document.data?.kind !== "resume" && (
        <div className="p-6">
          <GenerationProgress generation={generation} />
        </div>
      )}
      {generation?.status === "failed" && versions.length === 0 && (
        <div className="m-6 flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-xs">
          <span>
            {t.formatMessage({
              defaultMessage: "The last generation failed. Try again.",
            })}
          </span>
          {document.data?.kind === "resume" && (
            <LibraryResumeDialog
              documentId={documentId}
              defaultTone={generation.tone}
              trigger={
                <Button size="sm" variant="outline">
                  {t.formatMessage({ defaultMessage: "Try again" })}
                </Button>
              }
            />
          )}
        </div>
      )}
      {versions.length > 0 && document.data?.kind === "linkedin" && (
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <LinkedinEditor versions={versions} defaultTone={generation?.tone} />
        </div>
      )}
      {(versions.length > 0 || running) && document.data?.kind === "resume" && (
        <ResumeWorkspace versions={versions} generation={generation} />
      )}
    </div>
  );
}

/** The side panel of a library document: the preview and the versions. */
export function LibraryDocumentPanel({ documentId }: { documentId: string }) {
  const t = useTranslation();
  const rowLabel = useVersionRowLabel();
  const document = useLibraryDocument(documentId);
  const versions = document.data?.versions ?? [];
  const { selected, select } = useSelectedVersion(versions);
  const generating =
    document.data?.generation?.status === "pending" ||
    document.data?.generation?.status === "running";
  // A resume generating again hides the old version until the new one lands.
  if (
    !document.data ||
    versions.length === 0 ||
    !selected ||
    (generating && document.data.kind === "resume")
  ) {
    return null;
  }

  // LinkedIn text: a new version is a generation in another language; the
  // coverage review sits beside the text, in the editor.
  if (document.data.kind === "linkedin") {
    return (
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            {t.formatMessage({ defaultMessage: "Versions" })}
          </h3>
          <LinkedinDialog
            defaultTone={document.data.generation?.tone}
            trigger={
              <Button size="sm" variant="ghost">
                <Plus />
                {t.formatMessage({ defaultMessage: "New version" })}
              </Button>
            }
          />
        </div>
      </section>
    );
  }

  const tone = document.data.generation?.tone;
  return (
    <DocumentSidePanel
      version={selected}
      agent={
        <DocumentAgent
          documentId={documentId}
          kind={document.data.kind}
          version={selected}
        />
      }
      versions={
        <VersionsBlock
          document={document.data}
          version={selected}
          select={select}
          label={rowLabel(document.data.kind)}
          newVersion={
            <AdaptVersionDialog
              versions={versions}
              trigger={
                <Button size="sm" variant="ghost">
                  <Plus />
                  {t.formatMessage({ defaultMessage: "New version" })}
                </Button>
              }
            />
          }
          generateAgain={(version, trigger) => (
            <LibraryResumeDialog
              versionId={version.id}
              defaultTone={tone}
              trigger={trigger}
            />
          )}
        />
      }
    />
  );
}
