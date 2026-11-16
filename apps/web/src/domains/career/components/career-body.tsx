"use client";

import { WorkspaceBody } from "~/domains/workspace/components/workspace-body";

import { useCareerWorkspace } from "./career-workspace-context";
import { InterviewColumn } from "./interview-column";
import { SourcePreview } from "./source-preview";
import { TimelinePanel } from "./timeline-panel";

/** My career's chat, panel and source preview, resizable while one is open. */
export function CareerBody() {
  const { previewSourceDocumentId } = useCareerWorkspace();
  return (
    <WorkspaceBody
      layoutId="career"
      chat={<InterviewColumn />}
      panel={<TimelinePanel />}
      preview={<SourcePreview />}
      previewOpen={!!previewSourceDocumentId}
    />
  );
}
