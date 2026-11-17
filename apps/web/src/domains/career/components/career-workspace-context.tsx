"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import type { SourceImport } from "../hooks/use-source-upload";

type CareerWorkspace = {
  // The position whose space is open in the pane beside the chat.
  openPositionId: string | null;
  setOpenPositionId: (positionId: string | null) => void;
  // The career chat's unsent message, which a position card can prefill.
  draft: string;
  setDraft: (draft: string) => void;
  // Starts a message in the chat and puts the cursor there.
  prefillDraft: (draft: string) => void;
  // The source open in the preview beside the side panel.
  previewSourceDocumentId: string | null;
  setPreviewSourceDocumentId: (sourceDocumentId: string | null) => void;
  // Imports under way, from the side panel or the chat: the chat shows them.
  imports: SourceImport[];
  startImport: (started: SourceImport) => void;
  finishImport: (runId: string) => void;
};

const CareerWorkspaceContext = createContext<CareerWorkspace | null>(null);

/** Shared by the chat column and the timeline panel of My career. */
export function CareerWorkspaceProvider({ children }: { children: ReactNode }) {
  const [openPositionId, setOpenPositionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [previewSourceDocumentId, setPreviewSourceDocumentId] = useState<
    string | null
  >(null);
  const [imports, setImports] = useState<SourceImport[]>([]);

  return (
    <CareerWorkspaceContext
      value={{
        openPositionId,
        // One pane at a time: a position replaces a source preview, and back.
        setOpenPositionId: (positionId) => {
          setOpenPositionId(positionId);
          if (positionId) setPreviewSourceDocumentId(null);
        },
        draft,
        setDraft,
        prefillDraft: (text) => {
          setDraft(text);
          document.querySelector<HTMLTextAreaElement>("main textarea")?.focus();
        },
        previewSourceDocumentId,
        setPreviewSourceDocumentId: (sourceDocumentId) => {
          setPreviewSourceDocumentId(sourceDocumentId);
          if (sourceDocumentId) setOpenPositionId(null);
        },
        imports,
        startImport: (started) =>
          setImports((current) => [...current, started]),
        finishImport: (runId) =>
          setImports((current) => current.filter((run) => run.runId !== runId)),
      }}
    >
      {children}
    </CareerWorkspaceContext>
  );
}

/** The workspace when inside My career; null on other pages. */
export function useOptionalCareerWorkspace() {
  return useContext(CareerWorkspaceContext);
}

export function useCareerWorkspace() {
  const context = useContext(CareerWorkspaceContext);
  if (!context) throw new Error("Missing CareerWorkspaceProvider");
  return context;
}
