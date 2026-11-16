"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type CareerWorkspace = {
  // The interview session shown in the chat column.
  activeSessionId: string | null;
  setActiveSessionId: (sessionId: string | null) => void;
  // The source open in the preview beside the side panel.
  previewSourceDocumentId: string | null;
  setPreviewSourceDocumentId: (sourceDocumentId: string | null) => void;
};

const CareerWorkspaceContext = createContext<CareerWorkspace | null>(null);

/** Shared by the chat column and the timeline panel of My career. */
export function CareerWorkspaceProvider({ children }: { children: ReactNode }) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [previewSourceDocumentId, setPreviewSourceDocumentId] = useState<
    string | null
  >(null);

  return (
    <CareerWorkspaceContext
      value={{
        activeSessionId,
        setActiveSessionId,
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
