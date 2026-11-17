"use client";

import { useState } from "react";

import type { Timeline } from "@repo/api/domains/career/schemas/timeline";
import { useTranslation } from "@repo/intl/use-translation";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/web/components/ui/tabs";

import { ProfileAgent } from "~/domains/profile/components/profile-agent";
import { useProfileEditor } from "~/domains/profile/components/profile-editor-context";

import { Sources } from "./sources";

/**
 * Beside the profile: its agent and the user's sources, as tabs. Asking to
 * talk about a passage brings the agent forward.
 */
export function CareerSidePanel({
  documents,
  onPreview,
}: {
  documents: Timeline["documents"];
  onPreview: (sourceDocumentId: string) => void;
}) {
  const t = useTranslation();
  const { agentTopic, saveNow } = useProfileEditor();
  const [tab, setTab] = useState("agent");
  // A new topic (a passage, a finding) opens the agent, once per request.
  const [seenTopic, setSeenTopic] = useState(agentTopic?.id);
  if (agentTopic && agentTopic.id !== seenTopic) {
    setSeenTopic(agentTopic.id);
    setTab("agent");
  }
  // So does an import that just ended: the agent sums it up in the chat.
  const summaryPending = documents.some((document) => document.summaryPending);
  const [seenSummary, setSeenSummary] = useState(summaryPending);
  if (summaryPending !== seenSummary) {
    setSeenSummary(summaryPending);
    if (summaryPending) setTab("agent");
  }

  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
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
          onPreview={onPreview}
          beforeUpload={saveNow}
        />
      </TabsContent>
    </Tabs>
  );
}
