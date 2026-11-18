"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

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

/**
 * What the editor lends the agent about the changes it proposed: which
 * wait now, a fresh read of them with where each sits in the text, and a
 * way to show one. The editor registers them; the agent's panel is in
 * another column.
 */
export type ChangeHooks = {
  pendingIds: () => string[];
  refresh: () => Promise<
    Array<{ id: string; range: { start: number } | null }>
  >;
  show: (documentChangeId: string) => void;
};

type DocumentAgentState = {
  topic: DocumentAgentTopic | null;
  changeHooks: RefObject<ChangeHooks | null>;
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
  const changeHooks = useRef<ChangeHooks | null>(null);
  return (
    <DocumentAgentContext.Provider
      value={{
        topic,
        changeHooks,
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
