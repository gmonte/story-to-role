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
} from "react";

import { useEditor, type Editor } from "@tiptap/react";

import {
  parseBlocks,
  serializeBlocks,
  type ProfileBlock,
} from "@repo/api/domains/profile/truth/blocks";
import { fixFormat, fixFinding } from "@repo/api/domains/profile/truth/fix";
import {
  insertEntry,
  setCompetencyLevel,
  type ProfileEntry,
} from "@repo/api/domains/profile/truth/insert";
import {
  lintProfile,
  type ProfileFinding,
} from "@repo/api/domains/profile/truth/lint";
import type { CompetencyLevel } from "@repo/api/domains/profile/truth/sections";
import {
  readStructure,
  type ProfileStructure,
} from "@repo/api/domains/profile/truth/structure";
import type { ProfileDraft } from "@repo/api/domains/profile/schemas/profile";

import { useDraftAutosave, type SaveStatus } from "../hooks/use-profile-draft";
import { useProfileLabels } from "../hooks/use-profile-labels";
import {
  locateReviewFindings,
  useLatestValidation,
  type LocatedReviewFinding,
} from "../hooks/use-profile-validation";
import { blockPositions, blocksToDoc, docToBlocks } from "../utils/editor-doc";
import {
  focusNodeEnd,
  profileExtensions,
  setDecorations,
  type EditorDecorationSpec,
} from "../utils/editor-extensions";

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
  fix: (finding: ProfileFinding) => void;
  fixWholeFormat: () => void;
  goToLine: (line: number, range?: { from: number; to: number }) => void;
  // The last validation's findings, where their passages are now.
  reviewFindings: LocatedReviewFinding[];
  applyCompetencyLevel: (name: string, level: CompetencyLevel) => void;
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
function applyBlocks(editor: Editor, next: ProfileBlock[]) {
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
      editor.state.tr.replaceWith(0, doc.content.size, nodes).scrollIntoView()
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
  editor.view.dispatch(
    editor.state.tr.replaceWith(from, to, fragment).scrollIntoView()
  );
}

const labelHint = /^([^:(]*)(\([^)]*\))\s*:/;

export function ProfileEditorProvider({
  draft,
  children,
}: {
  draft: ProfileDraft;
  children: ReactNode;
}) {
  const { findingMessage, sectionHints } = useProfileLabels();
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
        title: findingMessage(finding, structure.language),
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
        title: finding.message,
        key: `review-${index}`,
      });
    });
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
          element.setAttribute("data-profile-hint", "");
          element.contentEditable = "false";
          element.textContent = hint;
          return element;
        },
        key: `hint-${section.heading}-${hint}`,
      });
    }
    setDecorations(editor, specs);
    // findingMessage and sectionHints change with the interface language only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, blocks, findings, structure, reviewFindings]);

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

  const value: ProfileEditorState = {
    editor,
    blocks,
    structure,
    findings,
    saveStatus: autosave.status,
    draft,
    markdown: () => serializeBlocks(currentBlocks()),
    saveNow: async () => {
      if (editor) {
        clearTimeout(lintTimer.current);
        const next = docToBlocks(editor.state.doc);
        setBlocks(next);
        autosave.change(serializeBlocks(next));
      }
      return autosave.saveNow();
    },
    revision: () => autosave.revision.current,
    resetTo: (next) => {
      autosave.reset(next);
      const nextBlocks = parseBlocks(next.markdown);
      editor?.commands.setContent(blocksToDoc(nextBlocks), {
        emitUpdate: false,
      });
      setBlocks(nextBlocks);
    },
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
