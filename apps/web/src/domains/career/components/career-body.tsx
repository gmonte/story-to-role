"use client";

import { WorkspaceBody } from "~/domains/workspace/components/workspace-body";

import { useCareerWorkspace } from "./career-workspace-context";
import { InterviewColumn } from "./interview-column";
import { SessionReview } from "./session-review";
import { SourcePreview } from "./source-preview";
import { TimelinePanel } from "./timeline-panel";

/**
 * My career's chat, panel, and the pane beside them (a review or a source
 * preview), resizable while it is open.
 */
export function CareerBody() {
  const { previewSourceDocumentId, activeSessionId } = useCareerWorkspace();
  return (
    <WorkspaceBody
      layoutId="career"
      chat={<InterviewColumn />}
      panel={<TimelinePanel />}
      // One pane beside the chat: a position under review or a source.
      preview={activeSessionId ? <SessionReview /> : <SourcePreview />}
      previewOpen={!!activeSessionId || !!previewSourceDocumentId}
    />
  );
}
