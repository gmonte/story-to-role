"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type CareerWorkspace = {
  // A position's session under review: the chat column shows its approval
  // screen instead of the conversation.
  activeSessionId: string | null;
  setActiveSessionId: (sessionId: string | null) => void;
  // The career chat's unsent message, which a position card can prefill.
  draft: string;
  setDraft: (draft: string) => void;
  // Starts a message in the chat and puts the cursor there.
  prefillDraft: (draft: string) => void;
  // The source open in the preview beside the side panel.
  previewSourceDocumentId: string | null;
  setPreviewSourceDocumentId: (sourceDocumentId: string | null) => void;
};

const CareerWorkspaceContext = createContext<CareerWorkspace | null>(null);

/** Shared by the chat column and the timeline panel of My career. */
export function CareerWorkspaceProvider({ children }: { children: ReactNode }) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [previewSourceDocumentId, setPreviewSourceDocumentId] = useState<
    string | null
  >(null);

  return (
    <CareerWorkspaceContext
      value={{
        activeSessionId,
        setActiveSessionId,
        draft,
        setDraft,
        prefillDraft: (text) => {
          setDraft(text);
          document.querySelector<HTMLTextAreaElement>("main textarea")?.focus();
        },
        previewSourceDocumentId,
        setPreviewSourceDocumentId,
      }}
    >
      {children}
    </CareerWorkspaceContext>
  );
}

export function useCareerWorkspace() {
  const context = useContext(CareerWorkspaceContext);
  if (!context) throw new Error("Missing CareerWorkspaceProvider");
  return context;
}
