"use client";

import { Loader2 } from "lucide-react";

import { useProfileDraftQuery } from "../hooks/use-profile-draft";
import { ProfileDocument } from "./profile-document";
import { ProfileEditorProvider } from "./profile-editor-context";
import { ProfileFindings } from "./profile-findings";
import { ProfileIndex } from "./profile-index";
import { ProfileReview } from "./profile-review";
import { ProfileToolbar } from "./profile-toolbar";

/**
 * My career's editor (profile spec, "The editor"): the index and the
 * findings on the left, the document in the middle; the page puts the agent
 * on the right.
 */
export function ProfileWorkspace() {
  const draft = useProfileDraftQuery();
  if (!draft.data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }
  return (
    <ProfileEditorProvider draft={draft.data}>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 space-y-6 overflow-y-auto border-r p-4 md:block">
          <ProfileIndex />
          <ProfileFindings />
          <ProfileReview />
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto">
          <ProfileToolbar />
          <ProfileDocument />
        </div>
      </div>
    </ProfileEditorProvider>
  );
}
