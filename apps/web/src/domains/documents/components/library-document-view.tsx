"use client";

import { Plus } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { useLibraryDocument } from "../hooks/use-library";
import { useSelectedVersion } from "../hooks/use-selected-version";
import { AdaptVersionDialog } from "./adapt-version-dialog";
import { GenerationProgress, VersionChecks } from "./documents-panel";
import { OutdatedNotice, SyncProposal } from "./language-sync";
import { LinkedinDialog } from "./linkedin-dialog";
import { LinkedinEditor } from "./linkedin-editor";
import { LibraryResumeDialog } from "./library-resume-dialog";
import { ResumeEditor } from "./resume-editor";

/** A library document in the editor, as an application's resume would be. */
export function LibraryDocumentView({ documentId }: { documentId: string }) {
  const t = useTranslation();
  const document = useLibraryDocument(documentId);
  const generation = document.data?.generation;
  const running =
    generation?.status === "pending" || generation?.status === "running";
  const versions = document.data?.versions ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
      {running && <GenerationProgress generation={generation} />}
      {generation?.status === "failed" && versions.length === 0 && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-xs">
          {t.formatMessage({
            defaultMessage: "The last generation failed. Try again.",
          })}
        </p>
      )}
      {versions.length > 0 && document.data?.kind === "linkedin" && (
        <LinkedinEditor versions={versions} defaultTone={generation?.tone} />
      )}
      {versions.length > 0 && document.data?.kind === "resume" && (
        <ResumeEditor
          versions={versions}
          generateAgain={(version, trigger) => (
            <LibraryResumeDialog
              versionId={version.id}
              defaultTone={generation?.tone}
              trigger={trigger}
            />
          )}
        />
      )}
    </div>
  );
}

/** The side panel of a library document: new versions, sync and checks. */
export function LibraryDocumentPanel({ documentId }: { documentId: string }) {
  const t = useTranslation();
  const document = useLibraryDocument(documentId);
  const versions = document.data?.versions ?? [];
  const { selected } = useSelectedVersion(versions);
  if (!document.data || versions.length === 0) return null;

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

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          {t.formatMessage({ defaultMessage: "Versions" })}
        </h3>
        <AdaptVersionDialog
          versions={versions}
          trigger={
            <Button size="sm" variant="ghost">
              <Plus />
              {t.formatMessage({ defaultMessage: "New version" })}
            </Button>
          }
        />
      </div>
      <SyncProposal document={document.data} versions={versions} />
      {selected && <OutdatedNotice version={selected} versions={versions} />}
      {selected && <VersionChecks version={selected} />}
    </section>
  );
}
