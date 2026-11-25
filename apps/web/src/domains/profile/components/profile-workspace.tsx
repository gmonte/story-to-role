"use client";

import type { ReactNode } from "react";

import { ResizableAside } from "~/domains/workspace/components/resizable-aside";
import { WorkspaceSkeleton } from "~/domains/workspace/components/workspace-skeleton";

import { useProfileDraftQuery } from "../hooks/use-profile-draft";
import { DocumentSwitch } from "./document-switch";
import { ProfileDocument } from "./profile-document";
import { ProfileEditorProvider } from "./profile-editor-context";
import { ProfileFindings } from "./profile-findings";
import { ProfileIndex } from "./profile-index";
import { ProfileReview } from "./profile-review";
import { ProfileSuggestionsBar } from "./profile-suggestions-bar";
import { ProfileToolbar } from "./profile-toolbar";

/**
 * Loads the profile's draft and holds the editor for everything inside:
 * the document and, beside it, the agent that talks about its passages.
 */
export function ProfileEditorGate({ children }: { children: ReactNode }) {
  const draft = useProfileDraftQuery();
  if (!draft.data) {
    return <WorkspaceSkeleton />;
  }
  return (
    <ProfileEditorProvider draft={draft.data}>{children}</ProfileEditorProvider>
  );
}

/**
 * My career's editor (profile spec, "The editor"): the index and the
 * findings on the left, the document in the middle; the page puts the agent
 * on the right.
 */
export function ProfileWorkspace() {
  return (
    <div className="flex min-h-0 flex-1">
      <ResizableAside
        storageKey="profile-index-width"
        className="space-y-6 p-4"
      >
        <DocumentSwitch current="profile" />
        <ProfileIndex />
        <ProfileFindings />
        <ProfileReview />
      </ResizableAside>
      <div className="min-w-0 flex-1 overflow-y-auto">
        {/* The toolbar and, while suggestions wait, their bar stay pinned
            to the top of the scrolling text. */}
        <div className="sticky top-0 z-20">
          <ProfileToolbar />
          <ProfileSuggestionsBar />
        </div>
        <ProfileDocument />
      </div>
    </div>
  );
}
