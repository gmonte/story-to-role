"use client";

import { useTranslation } from "@repo/intl/use-translation";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/web/components/ui/tabs";

import { ProfileAgent } from "~/domains/profile/components/profile-agent";
import {
  ProfileEditorGate,
  ProfileWorkspace,
} from "~/domains/profile/components/profile-workspace";
import { WorkspaceBody } from "~/domains/workspace/components/workspace-body";

import { useTimeline } from "../hooks/use-career-queries";
import { useCareerWorkspace } from "./career-workspace-context";
import { PrivacyNotice } from "./privacy-notice";
import { SourcePreview } from "./source-preview";
import { Sources } from "./sources";

/**
 * My career: the privacy notice, then the profile editor with its agent
 * and the user's sources beside it; a source's preview opens next to them.
 */
export function CareerBody() {
  const t = useTranslation();
  const timeline = useTimeline();
  const { previewSourceDocumentId, setPreviewSourceDocumentId } =
    useCareerWorkspace();

  if (!timeline.data) return null;
  // Nothing is written or uploaded before the privacy notice is
  // acknowledged.
  if (!timeline.data.profile.privacyNoticeAccepted) {
    return <WorkspaceBody layoutId="career" chat={<PrivacyNotice />} />;
  }
  const documents = timeline.data.documents;
  return (
    <ProfileEditorGate>
      <WorkspaceBody
        layoutId="career"
        chat={<ProfileWorkspace />}
        flushPanel
        panel={
          <Tabs
            defaultValue="agent"
            className="flex h-full min-h-0 flex-col gap-0"
          >
            <TabsList className="mx-3 mt-3 self-start">
              <TabsTrigger value="agent">
                {t.formatMessage({ defaultMessage: "Agent" })}
              </TabsTrigger>
              <TabsTrigger value="sources">
                {t.formatMessage(
                  { defaultMessage: "Sources ({count, number})" },
                  { count: documents.length }
                )}
              </TabsTrigger>
            </TabsList>
            {/* Kept mounted: the conversation survives a look at Sources. */}
            <TabsContent
              value="agent"
              forceMount
              className="min-h-0 flex-1 data-[state=inactive]:hidden"
            >
              <ProfileAgent />
            </TabsContent>
            <TabsContent value="sources" className="overflow-y-auto p-4">
              <Sources
                documents={documents}
                onPreview={setPreviewSourceDocumentId}
              />
            </TabsContent>
          </Tabs>
        }
        preview={<SourcePreview />}
        previewOpen={!!previewSourceDocumentId}
      />
    </ProfileEditorGate>
  );
}
