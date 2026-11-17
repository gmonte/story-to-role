"use client";

import { WorkspaceBody } from "~/domains/workspace/components/workspace-body";

import { useCareerWorkspace } from "./career-workspace-context";
import { InterviewColumn } from "./interview-column";
import { PositionSpace } from "./position-space";
import { SourcePreview } from "./source-preview";
import { TimelinePanel } from "./timeline-panel";

/**
 * My career's chat, panel, and the pane beside them (a position's space or
 * a source preview), resizable while it is open.
 */
export function CareerBody() {
  const { previewSourceDocumentId, openPositionId } = useCareerWorkspace();
  return (
    <WorkspaceBody
      layoutId="career"
      chat={<InterviewColumn />}
      panel={<TimelinePanel />}
      // One pane beside the chat: a position's space or a source.
      preview={openPositionId ? <PositionSpace /> : <SourcePreview />}
      previewOpen={!!openPositionId || !!previewSourceDocumentId}
    />
  );
}
