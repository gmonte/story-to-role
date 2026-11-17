"use client";

import { useTranslation } from "@repo/intl/use-translation";

import { WorkspaceBody } from "~/domains/workspace/components/workspace-body";
import { ProfileWorkspace } from "~/domains/profile/components/profile-workspace";

import { useTimeline } from "../hooks/use-career-queries";
import { useCareerWorkspace } from "./career-workspace-context";
import { PrivacyNotice } from "./privacy-notice";
import { SourcePreview } from "./source-preview";
import { Sources } from "./sources";

/**
 * My career: the privacy notice, then the profile editor, with the agent
 * (P3, docs/plan.md) and the user's sources beside it; a source's preview
 * opens next to them.
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
      chat={accepted ? <ProfileWorkspace /> : <PrivacyNotice />}
      // Nothing is uploaded before the privacy notice is acknowledged.
      panel={
        accepted ? (
          <div className="space-y-6">
            <section className="rounded-lg border border-dashed p-4">
              <h2 className="text-sm font-medium">
                {t.formatMessage({
                  defaultMessage: "The profile agent is on its way",
                })}
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                {t.formatMessage({
                  defaultMessage:
                    "Soon you'll select any passage and talk about it: the agent interviews you per the method and suggests changes you accept or reject.",
                })}
              </p>
            </section>
            <Sources
              documents={timeline.data.documents}
              onPreview={setPreviewSourceDocumentId}
            />
          </div>
        ) : undefined
      }
      preview={<SourcePreview />}
      previewOpen={!!previewSourceDocumentId}
    />
  );
}
