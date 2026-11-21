"use client";

import { useSearchParams } from "next/navigation";

import { PreferencesEditor } from "~/domains/profile/components/preferences-editor";
import {
  ProfileEditorGate,
  ProfileWorkspace,
} from "~/domains/profile/components/profile-workspace";
import { WorkspaceBody } from "~/domains/workspace/components/workspace-body";
import { WorkspaceSkeleton } from "~/domains/workspace/components/workspace-skeleton";

import { useTimeline } from "../hooks/use-career-queries";
import { CareerSidePanel } from "./career-side-panel";
import { useCareerWorkspace } from "./career-workspace-context";
import { PrivacyNotice } from "./privacy-notice";
import { SourcePreview } from "./source-preview";

/**
 * My career: the privacy notice, then the profile editor with its agent
 * and the user's sources beside it; a source's preview opens next to them.
 */
export function CareerBody() {
  const timeline = useTimeline();
  const searchParams = useSearchParams();
  const { previewSourceDocumentId, setPreviewSourceDocumentId } =
    useCareerWorkspace();

  if (!timeline.data) return <WorkspaceSkeleton />;
  // Nothing is written or uploaded before the privacy notice is
  // acknowledged.
  if (!timeline.data.profile.privacyNoticeAccepted) {
    return <WorkspaceBody layoutId="career" chat={<PrivacyNotice />} />;
  }
  // The job preferences are their own document, in the same editor; the
  // agent and the sources belong to the profile.
  if (searchParams.get("document") === "preferences") {
    return <WorkspaceBody layoutId="career" chat={<PreferencesEditor />} />;
  }
  return (
    <ProfileEditorGate>
      <WorkspaceBody
        layoutId="career"
        chat={<ProfileWorkspace />}
        flushPanel
        panel={
          <CareerSidePanel
            documents={timeline.data.documents}
            onPreview={setPreviewSourceDocumentId}
          />
        }
        preview={<SourcePreview />}
        previewOpen={!!previewSourceDocumentId}
      />
    </ProfileEditorGate>
  );
}
