"use client";

import { useTranslation } from "@repo/intl/use-translation";

import { ChatPlaceholder } from "~/domains/workspace/components/chat-placeholder";
import { WorkspaceBody } from "~/domains/workspace/components/workspace-body";

import { useTimeline } from "../hooks/use-career-queries";
import { useCareerWorkspace } from "./career-workspace-context";
import { PrivacyNotice } from "./privacy-notice";
import { SourcePreview } from "./source-preview";
import { Sources } from "./sources";

/**
 * My career until the profile editor arrives (P1, docs/plan.md): the
 * privacy notice, then a word on what comes next beside the user's sources,
 * whose preview opens next to them.
 */
export function CareerBody() {
  const t = useTranslation();
  const timeline = useTimeline();
  const { previewSourceDocumentId, setPreviewSourceDocumentId } =
    useCareerWorkspace();

  if (!timeline.data) return null;
  const accepted = timeline.data.profile.privacyNoticeAccepted;
  return (
    <WorkspaceBody
      layoutId="career"
      chat={
        accepted ? (
          <ChatPlaceholder
            heading={t.formatMessage({
              defaultMessage: "Your career profile is on its way",
            })}
            description={t.formatMessage({
              defaultMessage:
                "The profile editor arrives in the next update. Meanwhile, keep your resumes and other files in Sources.",
            })}
          />
        ) : (
          <PrivacyNotice />
        )
      }
      // Nothing is uploaded before the privacy notice is acknowledged.
      panel={
        accepted ? (
          <Sources
            documents={timeline.data.documents}
            onPreview={setPreviewSourceDocumentId}
          />
        ) : undefined
      }
      preview={<SourcePreview />}
      previewOpen={!!previewSourceDocumentId}
    />
  );
}
