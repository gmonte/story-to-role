"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEditor, type Editor } from "@tiptap/react";

import { useTranslation } from "@repo/intl/use-translation";
import {
  parseBlocks,
  serializeBlocks,
  type ProfileBlock,
} from "@repo/api/domains/profile/truth/blocks";
import { fixFormat, fixFinding } from "@repo/api/domains/profile/truth/fix";
import {
  quickActionsFor,
  type QuickAction,
} from "@repo/api/domains/profile/truth/quick-fix";
import {
  insertEntry,
  setCompetencyLevel,
  type ProfileEntry,
  type ProfileEntryKind,
} from "@repo/api/domains/profile/truth/insert";
import {
  lintProfile,
  type ProfileFinding,
} from "@repo/api/domains/profile/truth/lint";
import type {
  CompetencyLevel,
  ProfileSectionKey,
} from "@repo/api/domains/profile/truth/sections";
import {
  readStructure,
  type ProfileStructure,
} from "@repo/api/domains/profile/truth/structure";
import {
  applyChange,
  listParts,
  locateChange,
} from "@repo/api/domains/profile/truth/suggestions";
import type {
  ProfileDraft,
  ProfileSuggestion,
} from "@repo/api/domains/profile/schemas/profile";
import { buttonVariants } from "@repo/web/components/ui/button";
import { cn } from "@repo/web/lib/utils";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useDraftAutosave, type SaveStatus } from "../hooks/use-profile-draft";
import { useProfileLabels } from "../hooks/use-profile-labels";
import {
  locateReviewFindings,
  useLatestValidation,
  type LocatedReviewFinding,
} from "../hooks/use-profile-validation";
import { blockPositions, blocksToDoc, docToBlocks } from "../utils/editor-doc";
import {
  allowStructure,
  focusNodeEnd,
  profileExtensions,
  setDecorations,
  type EditorDecorationSpec,
} from "../utils/editor-extensions";
import { suggestionWidget } from "../utils/suggestion-widget";

// The most of a passage a message quotes.
export const maxQuoteCharacters = 1500;

// Lint runs after the user pauses this long, not on every keystroke.
const lintDelayMs = 150;

type ProfileEditorState = {
  editor: Editor | null;
  blocks: ProfileBlock[];
  structure: ProfileStructure;
  findings: ProfileFinding[];
  saveStatus: SaveStatus;
  draft: ProfileDraft;
  markdown: () => string;
  saveNow: () => Promise<number | null>;
  // The last saved draft revision.
  revision: () => number;
  resetTo: (next: { markdown: string; revision: number }) => void;
  insert: (entry: ProfileEntry) => void;
  // Set by the document: opens its dialog to write an entry of that kind.
  entryOpenerRef: RefObject<((kind: ProfileEntryKind) => void) | null>;
  fix: (finding: ProfileFinding) => void;
  /** The one-click edits a finding offers, none when it has no such edit. */
  quickActions: (finding: ProfileFinding) => QuickAction[];
  /** Applies one of them as a single undo step and goes to its line. */
  // `goTo`: puts the cursor on the changed line, scrolling to it; from the
  // findings list, not from the card over the text being read.
  applyQuickAction: (action: QuickAction, options?: { goTo?: boolean }) => void;
  fixWholeFormat: () => void;
  goToLine: (line: number, range?: { from: number; to: number }) => void;
  // The last validation's findings, where their passages are now.
  reviewFindings: LocatedReviewFinding[];
  applyCompetencyLevel: (name: string, level: CompetencyLevel) => void;
  // The suggestions waiting, with the lines each would replace now (null
  // when its lines were edited away).
  suggestions: LocatedSuggestion[];
  acceptSuggestions: (profileSuggestionIds?: string[]) => void;
  rejectSuggestions: (profileSuggestionIds?: string[]) => void;
  refreshSuggestions: () => void;
  // What the agent's composer is about: a passage, and words to start from.
  agentTopic: AgentTopic | null;
  // `line` is where the passage starts, which tells its part.
  talkAbout: (topic: { quote: string; line: number; text?: string }) => void;
  clearAgentQuote: () => void;
};

export type LocatedSuggestion = ProfileSuggestion & {
  range: { start: number; end: number } | null;
};

// `id` changes with every request, so the same passage can be asked twice.
export type AgentTopic = {
  id: number;
  quote: string | null;
  // The key of the part of the profile the passage is in.
  part: string | null;
  text: string;
};

const ProfileEditorContext = createContext<ProfileEditorState | null>(null);

export function useProfileEditor() {
  const context = useContext(ProfileEditorContext);
  if (!context) throw new Error("useProfileEditor outside its provider");
  return context;
}

function sameBlock(a: ProfileBlock, b: ProfileBlock) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameBlocks(a: ProfileBlock[], b: ProfileBlock[]) {
  return a.length === b.length && a.every((block, i) => sameBlock(block, b[i]));
}

/**
 * Replaces only the blocks that differ, in one transaction, so a fix or an
 * insert is a single undo step and the rest of the text (and the cursor)
 * stays put.
 */
// `scroll`: brings the cursor into view after the change; off for an edit
// made from where the user is reading.
function applyBlocks(
  editor: Editor,
  next: ProfileBlock[],
  { scroll = true }: { scroll?: boolean } = {}
) {
  const { doc } = editor.state;
  const current = docToBlocks(doc);
  const positions = blockPositions(doc);
  let start = 0;
  while (
    start < current.length &&
    start < next.length &&
    sameBlock(current[start], next[start])
  ) {
    start++;
  }
  let endCurrent = current.length;
  let endNext = next.length;
  while (
    endCurrent > start &&
    endNext > start &&
    sameBlock(current[endCurrent - 1], next[endNext - 1])
  ) {
    endCurrent--;
    endNext--;
  }
  if (start === endCurrent && start === endNext) return;
  // An empty document holds one blank paragraph that isn't a block.
  if (!current.length) {
    const nodes = (blocksToDoc(next).content ?? []).map((json) =>
      editor.schema.nodeFromJSON(json)
    );
    editor.view.dispatch(
      editor.state.tr
        .replaceWith(0, doc.content.size, nodes)
        .setMeta(allowStructure, true)
        .scrollIntoView()
    );
    return;
  }

  const from = start < positions.length ? positions[start] : doc.content.size;
  const last = positions[endCurrent - 1];
  const to =
    endCurrent > start ? last + (doc.nodeAt(last)?.nodeSize ?? 0) : from;
  const nodes = blocksToDoc(next.slice(start, endNext)).content ?? [];
  const fragment = next.slice(start, endNext).length
    ? nodes.map((json) => editor.schema.nodeFromJSON(json))
    : [];
  const tr = editor.state.tr
    .replaceWith(from, to, fragment)
    .setMeta(allowStructure, true);
  editor.view.dispatch(scroll ? tr.scrollIntoView() : tr);
}

const entryOfSection: Partial<Record<ProfileSectionKey, ProfileEntryKind>> = {
  experience: "experience",
  education: "education",
  certifications: "certification",
  languages: "language",
  competencies: "competency",
  gaps: "gap",
  rules: "rule",
  addenda: "addendum",
};

const labelHint = /^([^:(]*)(\([^)]*\))\s*:/;

export function ProfileEditorProvider({
  draft,
  children,
}: {
  draft: ProfileDraft;
  children: ReactNode;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { sectionHints, entryLabels } = useProfileLabels();
  const entryOpenerRef = useRef<((kind: ProfileEntryKind) => void) | null>(
    null
  );
  const autosave = useDraftAutosave(draft);
  const [blocks, setBlocks] = useState(() => parseBlocks(draft.markdown));
  const lintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const editor = useEditor({
    extensions: profileExtensions(),
    content: blocksToDoc(parseBlocks(draft.markdown)),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "profile-editor focus:outline-none",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: current, transaction }) => {
      if (!transaction.docChanged) return;
      clearTimeout(lintTimer.current);
      lintTimer.current = setTimeout(() => {
        const next = docToBlocks(current.state.doc);
        setBlocks(next);
        autosave.change(serializeBlocks(next));
      }, lintDelayMs);
    },
  });

  const structure = useMemo(() => readStructure(blocks), [blocks]);
  const findings = useMemo(() => lintProfile(blocks), [blocks]);
  const validation = useLatestValidation();
  const reviewFindings = useMemo(
    () => locateReviewFindings(validation.data?.report, blocks),
    [validation.data, blocks]
  );

  const suggestionsQuery = useQuery(trpc.profile.suggestions.queryOptions({}));
  const suggestions = useMemo<LocatedSuggestion[]>(
    () =>
      (suggestionsQuery.data ?? []).map((suggestion) => ({
        ...suggestion,
        range: locateChange(blocks, suggestion),
      })),
    [suggestionsQuery.data, blocks]
  );
  const { mutate: resolveSuggestions } = useMutation(
    trpc.profile.resolveSuggestions.mutationOptions()
  );
  const [agentTopic, setAgentTopic] = useState<AgentTopic | null>(null);
  // The widgets in the text call the latest handlers.
  const suggestionHandlers = useRef<{
    accept: (profileSuggestionId: string) => void;
    both: (profileSuggestionId: string) => void;
    reject: (profileSuggestionId: string) => void;
  } | null>(null);
  const suggestionLabels = {
    accept: t.formatMessage({ defaultMessage: "Accept" }),
    both: t.formatMessage({
      defaultMessage: "Keep both",
      description: "Keeps the old lines and adds the suggested ones after them",
    }),
    reject: t.formatMessage({ defaultMessage: "Reject" }),
    removal: t.formatMessage({ defaultMessage: "Remove the lines above" }),
  };

  // The findings and hints drawn over the text follow every lint.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const { doc } = editor.state;
    // Mid-typing the doc is ahead of the last lint; the next lint draws.
    if (!sameBlocks(docToBlocks(doc), blocks)) return;
    const positions = blockPositions(doc);
    const specs: EditorDecorationSpec[] = [];
    findings.forEach((finding, index) => {
      if (finding.line === null) return;
      const start = positions[finding.line] + 1;
      const end = start + blocks[finding.line].text.length;
      specs.push({
        kind: "inline",
        from: Math.min(start + finding.from, end),
        to: Math.min(start + Math.max(finding.to, finding.from + 1), end),
        className: `profile-finding profile-finding-${finding.kind}`,
        finding: `finding-${index}`,
        key: `finding-${index}`,
      });
    });
    reviewFindings.forEach((finding, index) => {
      const start = positions[finding.line] + 1;
      specs.push({
        kind: "inline",
        from: start + finding.from,
        to: start + finding.to,
        className: "profile-finding profile-finding-review",
        finding: `review-${index}`,
        key: `review-${index}`,
      });
    });
    // Each suggestion as a tracked change: the lines it replaces struck
    // through, and what it writes below them with Accept and Reject.
    for (const suggestion of suggestions) {
      const { range } = suggestion;
      if (!range) continue;
      for (let line = range.start; line < range.end; line++) {
        const from = positions[line];
        specs.push({
          kind: "node",
          from,
          to: from + (doc.nodeAt(from)?.nodeSize ?? 0),
          className: "profile-suggestion-old",
          key: `suggestion-old-${suggestion.id}-${line}`,
        });
      }
      specs.push({
        kind: "widget",
        at:
          range.end < positions.length
            ? positions[range.end]
            : doc.content.size,
        interactive: true,
        element: () =>
          suggestionWidget(suggestion, suggestionLabels, {
            accept: (profileSuggestionId) =>
              suggestionHandlers.current?.accept(profileSuggestionId),
            both: (profileSuggestionId) =>
              suggestionHandlers.current?.both(profileSuggestionId),
            reject: (profileSuggestionId) =>
              suggestionHandlers.current?.reject(profileSuggestionId),
          }),
        key: `suggestion-${suggestion.id}`,
      });
    }
    blocks.forEach((block, line) => {
      if (block.type !== "item") return;
      const hint = labelHint.exec(block.text);
      if (!hint) return;
      const start = positions[line] + 1 + hint[1].length;
      specs.push({
        kind: "inline",
        from: start,
        to: start + hint[2].length,
        className: "profile-label-hint",
        key: `label-${line}`,
      });
    });
    for (const section of structure.sections) {
      const hint = section.key && sectionHints[section.key];
      if (!hint || section.end > section.start) continue;
      const heading = positions[section.heading];
      specs.push({
        kind: "widget",
        at: heading + (doc.nodeAt(heading)?.nodeSize ?? 0),
        element: () => {
          const element = document.createElement("div");
          element.className = "profile-section-hint";
          element.setAttribute("data-profile-aside", "");
          element.contentEditable = "false";
          element.textContent = hint;
          return element;
        },
        key: `hint-${section.heading}-${hint}`,
      });
    }
    // A quiet button closing each section that holds entries.
    for (const section of structure.sections) {
      const kind = section.key && entryOfSection[section.key];
      if (!kind) continue;
      const label = t.formatMessage(
        { defaultMessage: "Add {entry}" },
        { entry: entryLabels[kind].toLocaleLowerCase() }
      );
      specs.push({
        kind: "widget",
        at:
          section.end < positions.length
            ? positions[section.end]
            : doc.content.size,
        interactive: true,
        element: () => {
          const element = document.createElement("div");
          element.className = "profile-add-entry";
          element.setAttribute("data-profile-aside", "");
          element.contentEditable = "false";
          const button = document.createElement("button");
          button.type = "button";
          // The app's secondary Button, small, as classes: plain DOM here.
          button.className = cn(
            buttonVariants({ variant: "secondary" }),
            "h-7 px-2.5 text-xs"
          );
          button.textContent = `+ ${label}`;
          button.addEventListener("mousedown", (event) =>
            event.preventDefault()
          );
          button.addEventListener("click", () =>
            entryOpenerRef.current?.(kind)
          );
          element.append(button);
          return element;
        },
        key: `add-${section.heading}-${label}`,
      });
    }
    setDecorations(editor, specs);
    // sectionHints change with the interface language only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, blocks, findings, structure, reviewFindings, suggestions]);

  const currentBlocks = useCallback(
    () => (editor ? docToBlocks(editor.state.doc) : blocks),
    [editor, blocks]
  );

  const goToLine = useCallback(
    (line: number, range?: { from: number; to: number }) => {
      if (!editor) return;
      const positions = blockPositions(editor.state.doc);
      const start = positions[line];
      if (start === undefined) return;
      if (range) {
        editor
          .chain()
          .setTextSelection({
            from: start + 1 + range.from,
            to: start + 1 + range.to,
          })
          .scrollIntoView()
          .focus()
          .run();
      } else {
        focusNodeEnd(editor, start);
      }
    },
    [editor]
  );

  /** Saves what is in the editor now, resolving to the saved revision. */
  const saveNow = async () => {
    if (editor) {
      clearTimeout(lintTimer.current);
      const next = docToBlocks(editor.state.doc);
      setBlocks(next);
      autosave.change(serializeBlocks(next));
    }
    return autosave.saveNow();
  };

  const forgetSuggestions = (ids: string[]) =>
    queryClient.setQueryData(
      trpc.profile.suggestions.queryKey({}),
      (current: ProfileSuggestion[] | undefined) =>
        current?.filter((suggestion) => !ids.includes(suggestion.id))
    );

  const refreshSuggestions = () =>
    void queryClient.invalidateQueries({
      queryKey: trpc.profile.suggestions.queryKey({}),
    });

  // The answer didn't reach the server: the list shows what it still holds
  // (a change already in the text no longer fits, and can be rejected).
  const suggestionsNotRecorded = () => {
    refreshSuggestions();
    toast.error(
      t.formatMessage({
        defaultMessage:
          "Your answer to the suggestion couldn't be saved. Try again.",
      })
    );
  };

  /**
   * Applies the given suggestions (all of them by default) to the text as
   * one undo step; those whose lines are gone stay waiting.
   */
  const acceptSuggestions = (
    profileSuggestionIds?: string[],
    // Keep the lines a suggestion replaces, adding its lines after them.
    { keepBoth = false }: { keepBoth?: boolean } = {}
  ) => {
    if (!editor) return;
    let next = currentBlocks();
    const applied: string[] = [];
    for (const suggestion of suggestions) {
      if (
        profileSuggestionIds &&
        !profileSuggestionIds.includes(suggestion.id)
      ) {
        continue;
      }
      const changed = applyChange(
        next,
        keepBoth && suggestion.find.trim()
          ? {
              ...suggestion,
              replace: [suggestion.find, suggestion.replace].join("\n"),
            }
          : suggestion
      );
      if (!changed) continue;
      next = changed;
      applied.push(suggestion.id);
    }
    if (!applied.length) {
      toast.error(
        t.formatMessage({
          defaultMessage:
            "The text changed since this was suggested, so it can't be applied. Reject it, or ask the agent again.",
        })
      );
      return;
    }
    applyBlocks(editor, next);
    forgetSuggestions(applied);
    // Recorded once the draft holds the change: if the save fails, the
    // suggestion is still waiting after a reload, like the text it changed.
    void saveNow().then((revision) => {
      if (revision === null) return;
      resolveSuggestions(
        { resolution: "accepted", profileSuggestionIds: applied },
        { onError: suggestionsNotRecorded }
      );
    });
  };

  const rejectSuggestions = (profileSuggestionIds?: string[]) => {
    const ids = profileSuggestionIds ?? suggestions.map((s) => s.id);
    if (!ids.length) return;
    forgetSuggestions(ids);
    resolveSuggestions(
      { resolution: "rejected", profileSuggestionIds: ids },
      { onError: suggestionsNotRecorded }
    );
  };

  suggestionHandlers.current = {
    accept: (profileSuggestionId) => acceptSuggestions([profileSuggestionId]),
    both: (profileSuggestionId) =>
      acceptSuggestions([profileSuggestionId], { keepBoth: true }),
    reject: (profileSuggestionId) => rejectSuggestions([profileSuggestionId]),
  };

  const value: ProfileEditorState = {
    editor,
    blocks,
    structure,
    findings,
    saveStatus: autosave.status,
    draft,
    markdown: () => serializeBlocks(currentBlocks()),
    saveNow,
    revision: () => autosave.revision.current,
    resetTo: (next) => {
      autosave.reset(next);
      const nextBlocks = parseBlocks(next.markdown);
      if (editor) {
        const nodes = (blocksToDoc(nextBlocks).content ?? []).map((json) =>
          editor.schema.nodeFromJSON(json)
        );
        editor.view.dispatch(
          editor.state.tr
            .replaceWith(0, editor.state.doc.content.size, nodes)
            .setMeta(allowStructure, true)
            .setMeta("preventUpdate", true)
        );
      }
      setBlocks(nextBlocks);
    },
    entryOpenerRef,
    insert: (entry) => {
      if (!editor) return;
      const { blocks: next, line } = insertEntry(currentBlocks(), entry);
      applyBlocks(editor, next);
      // An experience opens on its first line (the context) to write on.
      const target = entry.kind === "experience" ? line + 1 : line;
      requestAnimationFrame(() => {
        goToLine(target);
        // A label waiting for its value gets the space after the colon.
        if (next[target]?.text.endsWith(":"))
          editor.commands.insertContent(" ");
      });
    },
    fix: (finding) => {
      if (!editor) return;
      // The finding came from the last lint; fix its match in the text now.
      const fresh = currentBlocks();
      const match = lintProfile(fresh).find(
        (candidate) =>
          candidate.code === finding.code &&
          candidate.line === finding.line &&
          candidate.from === finding.from
      );
      if (match) applyBlocks(editor, fixFinding(fresh, match));
    },
    quickActions: (finding) =>
      quickActionsFor(finding, blocks, structure.language),
    applyQuickAction: (action, { goTo = true } = {}) => {
      if (!editor) return;
      // The action was computed from the last lint; typing since makes it stale.
      if (JSON.stringify(currentBlocks()) !== JSON.stringify(blocks)) return;
      applyBlocks(editor, action.blocks, { scroll: goTo });
      if (!goTo) return;
      requestAnimationFrame(() => {
        goToLine(action.line);
        // A label waiting for its value gets the space after the colon.
        if (action.blocks[action.line]?.text.endsWith(":"))
          editor.commands.insertContent(" ");
      });
    },
    suggestions,
    acceptSuggestions,
    rejectSuggestions,
    refreshSuggestions,
    agentTopic,
    talkAbout: ({ quote, line, text }) =>
      setAgentTopic({
        id: Date.now(),
        // A long selection is about its start; the agent reads the rest.
        quote: quote.slice(0, maxQuoteCharacters),
        // The innermost part holding the line: an experience before its
        // section.
        part:
          listParts(currentBlocks()).findLast(
            (part) => line >= part.start && line < part.end
          )?.key ?? null,
        text: text ?? "",
      }),
    clearAgentQuote: () =>
      setAgentTopic((topic) => topic && { ...topic, quote: null, part: null }),
    reviewFindings,
    applyCompetencyLevel: (name, level) => {
      if (!editor) return;
      applyBlocks(editor, setCompetencyLevel(currentBlocks(), name, level));
    },
    fixWholeFormat: () => {
      if (!editor) return;
      applyBlocks(editor, fixFormat(currentBlocks()));
    },
    goToLine,
  };

  return (
    <ProfileEditorContext.Provider value={value}>
      {children}
    </ProfileEditorContext.Provider>
  );
}
