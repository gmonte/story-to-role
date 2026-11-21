"use client";

import { useEffect } from "react";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { WorkspaceBody } from "~/domains/workspace/components/workspace-body";
import { WorkspaceSkeleton } from "~/domains/workspace/components/workspace-skeleton";

import { useLibraryDocument } from "../hooks/use-library";
import { useSelectedVersion } from "../hooks/use-selected-version";
import { AdaptVersionDialog } from "./adapt-version-dialog";
import { DeleteDocumentDialog } from "./delete-document-dialog";
import { DocumentAgent } from "./document-agent";
import { DocumentAgentProvider } from "./document-agent-context";
import {
  DocumentSidePanel,
  useVersionRowLabel,
  VersionsBlock,
} from "./document-side-panel";
import { GenerationProgress } from "./documents-panel";
import { LibraryResumeDialog } from "./library-resume-dialog";
import { ResumeWorkspace } from "./resume-workspace";

/** A library document's screen: the workspace and its side panel. */
export function LibraryDocumentBody({ documentId }: { documentId: string }) {
  const document = useLibraryDocument(documentId);
  // The whole screen in outline until the document arrives.
  if (!document.data) return <WorkspaceSkeleton />;
  return (
    <DocumentAgentProvider>
      <WorkspaceBody
        layoutId="library-document"
        flushPanel
        chat={<LibraryDocumentView documentId={documentId} />}
        panel={<LibraryDocumentPanel documentId={documentId} />}
      />
    </DocumentAgentProvider>
  );
}

/** A library document in the editor, as an application's resume would be. */
export function LibraryDocumentView({ documentId }: { documentId: string }) {
  const t = useTranslation();
  const router = useRouter();
  const document = useLibraryDocument(documentId);
  // The LinkedIn text has its own page; an old link to it opens there.
  const isLinkedin = document.data?.kind === "linkedin";
  useEffect(() => {
    if (isLinkedin) router.replace("/app/linkedin");
  }, [isLinkedin, router]);
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
        <div className="border-destructive/40 bg-destructive/10 m-6 flex items-center justify-between gap-3 rounded-lg border p-2.5 text-xs">
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
  const router = useRouter();
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

  const deleteDocument = (
    <DeleteDocumentDialog
      documentId={documentId}
      onDeleted={() => router.push("/app/library")}
      trigger={
        <Button
          size="sm"
          variant="ghost"
          title={t.formatMessage({ defaultMessage: "Delete document" })}
        >
          <Trash2 />
        </Button>
      }
    />
  );

  if (document.data.kind === "linkedin") return null;

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
            <div className="flex items-center gap-1">
              <AdaptVersionDialog
                versions={versions}
                trigger={
                  <Button size="sm" variant="ghost">
                    <Plus />
                    {t.formatMessage({ defaultMessage: "New version" })}
                  </Button>
                }
              />
              {deleteDocument}
            </div>
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
