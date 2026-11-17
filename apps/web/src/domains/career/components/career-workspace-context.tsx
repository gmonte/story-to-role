"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type CareerWorkspace = {
  // The source open in the preview beside the side panel.
  previewSourceDocumentId: string | null;
  setPreviewSourceDocumentId: (sourceDocumentId: string | null) => void;
};

const CareerWorkspaceContext = createContext<CareerWorkspace | null>(null);

/** Shared by the column and the side panel of My career. */
export function CareerWorkspaceProvider({ children }: { children: ReactNode }) {
  const [previewSourceDocumentId, setPreviewSourceDocumentId] = useState<
    string | null
  >(null);

  return (
    <CareerWorkspaceContext
      value={{ previewSourceDocumentId, setPreviewSourceDocumentId }}
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
