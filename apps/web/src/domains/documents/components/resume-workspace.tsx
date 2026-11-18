"use client";

import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";

import { useSelectedVersion } from "../hooks/use-selected-version";
import { DocumentWorkspace } from "./document-workspace";
import { TitleProposals } from "./title-proposals";

/** A resume in the document workspace: the version the URL selects. */
export function ResumeWorkspace({ versions }: { versions: VersionView[] }) {
  const { selected, select } = useSelectedVersion(versions, "resume");
  if (selected?.content.kind !== "resume") return null;
  return (
    <DocumentWorkspace
      version={selected}
      versions={versions}
      select={select}
      notices={
        selected.titleProposals.length > 0 ? (
          <TitleProposals version={selected} />
        ) : null
      }
    />
  );
}
