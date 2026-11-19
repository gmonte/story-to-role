"use client";

import type { ReactNode } from "react";

import type {
  DocumentView,
  VersionView,
} from "@repo/api/domains/documents/schemas/document-view";

import { useSelectedVersion } from "../hooks/use-selected-version";
import { GenerationProgress } from "./documents-panel";
import { DocumentWorkspace } from "./document-workspace";
import { TitleProposals } from "./title-proposals";

/**
 * A resume in the document workspace: the version the URL selects. While a
 * generation runs, its progress takes the document's place, and the new
 * version shows when it ends.
 */
export function ResumeWorkspace({
  versions,
  generation,
  aside,
}: {
  versions: VersionView[];
  generation?: DocumentView["generation"];
  aside?: ReactNode;
}) {
  const { selected, select } = useSelectedVersion(versions, "resume");
  if (generation?.status === "pending" || generation?.status === "running") {
    return (
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 space-y-6 overflow-y-auto border-r p-4 empty:hidden md:block">
          {aside}
        </aside>
        <div className="flex min-w-0 flex-1 items-start justify-center overflow-y-auto p-6">
          <div className="w-full max-w-xl">
            <GenerationProgress generation={generation} />
          </div>
        </div>
      </div>
    );
  }
  if (selected?.content.kind !== "resume") return null;
  return (
    <DocumentWorkspace
      version={selected}
      versions={versions}
      select={select}
      aside={aside}
      notices={
        selected.titleProposals.length > 0 ? (
          <TitleProposals version={selected} />
        ) : null
      }
    />
  );
}
