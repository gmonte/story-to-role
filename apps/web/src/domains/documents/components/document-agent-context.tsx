"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import type { AgentAttachment } from "@repo/api/domains/agents/agent-message";

// A long selection is about its start; the agent reads the rest.
export const maxDocumentQuoteCharacters = 1500;

// `id` changes with every request, so the same passage can be asked twice.
export type DocumentAgentTopic = {
  id: number;
  quote: string | null;
  // The finding or review note being discussed, shown apart from the words.
  attachment: AgentAttachment | null;
};

type DocumentAgentState = {
  topic: DocumentAgentTopic | null;
  talkAbout: (topic: {
    quote?: string | null;
    attachment?: AgentAttachment | null;
  }) => void;
  clearQuote: () => void;
  clearAttachment: () => void;
};

const DocumentAgentContext = createContext<DocumentAgentState | null>(null);

/** The document agent's topic, or null where there is no agent. */
export function useDocumentAgent() {
  return useContext(DocumentAgentContext);
}

/**
 * What the document agent's composer is about (resume spec, "Document
 * workspace"): a passage the user selected in the editor, or a finding
 * they asked about. It sits above the editor and the side panel, which
 * are columns of their own, so the one can send to the other.
 */
export function DocumentAgentProvider({ children }: { children: ReactNode }) {
  const [topic, setTopic] = useState<DocumentAgentTopic | null>(null);
  return (
    <DocumentAgentContext.Provider
      value={{
        topic,
        talkAbout: ({ quote, attachment }) =>
          setTopic({
            id: Date.now(),
            quote: quote?.slice(0, maxDocumentQuoteCharacters) ?? null,
            attachment: attachment ?? null,
          }),
        clearQuote: () =>
          setTopic((current) => current && { ...current, quote: null }),
        clearAttachment: () =>
          setTopic((current) => current && { ...current, attachment: null }),
      }}
    >
      {children}
    </DocumentAgentContext.Provider>
  );
}
