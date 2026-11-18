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

import { useMutation } from "@tanstack/react-query";
import { useEditor, type Editor } from "@tiptap/react";

import {
  coverageFindingKey,
  isIgnorable,
  reviewNoteKey,
} from "@repo/api/domains/documents/coverage-review/finding-key";
import { isWarningFinding } from "@repo/api/domains/documents/coverage-review/warning-codes";
import type {
  CoverageView,
  VersionView,
} from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import { toast } from "@repo/web/components/ui/sonner";
import { cn } from "@repo/web/lib/utils";

import {
  editorScrollMargins,
  setDecorations,
  type EditorDecorationSpec,
} from "~/domains/profile/utils/editor-extensions";
import { useTRPC } from "~/tools/trpc/client";

import { useRefreshDocuments } from "../hooks/use-opening-documents";
import {
  blocksToContent,
  contentToBlocks,
  linesById,
  type DocumentBlock,
  type EditableContent,
} from "../utils/document-blocks";
import {
  appendBullet,
  blockPositions,
  blocksToDoc,
  docToBlocks,
  documentExtensions,
  replaceBlockText,
  resetDocument,
  scrollToBlock,
} from "../utils/document-editor-extensions";
import { originTone } from "./editing";

export type DocumentFinding = CoverageView["findings"][number];

/** A note of the AI review shown in the text: an inconsistency or a suggestion. */
export type ReviewNote = {
  kind: "inconsistency" | "suggestion";
  lineId: string | null;
  lineText: string | null;
  text: string;
  // A `profile` suggestion can be sent to the profile's draft.
  profileSuggestion: { coverageReviewId: string; lineId: string } | null;
};

export type SaveStatus = "saved" | "pending" | "saving" | "error";

type DocumentEditorState = {
  editor: Editor | null;
  version: VersionView;
  content: EditableContent;
  blocks: DocumentBlock[];
  saveStatus: SaveStatus;
  trace: boolean;
  setTrace: (trace: boolean) => void;
  /** The code checks that count: ignored warnings are left out. */
  findings: DocumentFinding[];
  ignoredFindings: DocumentFinding[];
  notes: ReviewNote[];
  ignoredNotes: ReviewNote[];
  /** Whether a finding may be ignored (only one that doesn't block). */
  canIgnore: (finding: DocumentFinding) => boolean;
  ignoreFinding: (finding: DocumentFinding) => void;
  restoreFinding: (finding: DocumentFinding) => void;
  ignoreNote: (note: ReviewNote) => void;
  restoreNote: (note: ReviewNote) => void;
  /** The one-click fix of a finding, when code has one. */
  fixFor: (finding: DocumentFinding) => (() => void) | null;
  goToBlock: (index: number) => void;
  goToLine: (lineId: string) => void;
  goToOwner: (ownerId: string) => void;
  addBullet: (ownerId: string) => void;
};

const DocumentEditorContext = createContext<DocumentEditorState | null>(null);

export function useDocumentEditor() {
  const context = useContext(DocumentEditorContext);
  if (!context) throw new Error("useDocumentEditor outside its provider");
  return context;
}

// Blocks are read after the user pauses this long, not on every keystroke.
const readDelayMs = 150;
// How long the user pauses before the edit becomes a snapshot.
const saveDelayMs = 800;

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Where a finding's words sit in the line, to underline just them. */
function spanOf(text: string, finding: DocumentFinding) {
  const needle =
    finding.code === "figure"
      ? String(finding.params.figures ?? "")
          .split(",")[0]
          ?.trim()
      : String(finding.params.term ?? finding.params.name ?? "");
  if (!needle) return null;
  const match = new RegExp(escapeRegExp(needle), "i").exec(text);
  return match
    ? { from: match.index, to: match.index + match[0].length }
    : null;
}

function editableContent(version: VersionView): EditableContent {
  if (version.content.kind === "linkedin") {
    throw new Error("LinkedIn text keeps its own editor");
  }
  return version.content;
}

/**
 * Holds the document's editor (resume spec, "Document workspace"): the
 * snapshot as blocks, edits saved as snapshots after a pause, the findings
 * drawn over the text and the ones the user ignored, the trace mode. Keyed
 * by version: another version is another editor.
 */
export function DocumentEditorProvider({
  version,
  children,
}: {
  version: VersionView;
  children: ReactNode;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const initial = useMemo(
    () => contentToBlocks(editableContent(version), version.language),
    // The editor starts from the version it was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [blocks, setBlocks] = useState(initial);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [trace, setTrace] = useState(false);
  // The snapshot the editor's text is written over.
  const base = useRef({
    snapshotId: version.snapshot.id,
    content: editableContent(version),
  });
  const latest = useRef<DocumentBlock[] | null>(null);
  const readTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inFlight = useRef(false);
  const { mutateAsync: saveEdit } = useMutation(
    trpc.documents.saveEdit.mutationOptions()
  );

  const noteLabel = useCallback(
    (requirement: string) =>
      t.formatMessage(
        { defaultMessage: "Included for: {requirement}" },
        { requirement }
      ),
    [t]
  );

  /** Saves until what is saved is the latest text. */
  const flush = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      for (;;) {
        const pending = latest.current;
        if (!pending) break;
        const content = blocksToContent(base.current.content, pending);
        if (JSON.stringify(content) === JSON.stringify(base.current.content)) {
          latest.current = null;
          break;
        }
        setSaveStatus("saving");
        const { snapshotId } = await saveEdit({
          versionId: version.id,
          baseSnapshotId: base.current.snapshotId,
          content,
        });
        base.current = { snapshotId, content };
        if (latest.current === pending) latest.current = null;
        await refresh();
      }
      setSaveStatus("saved");
    } catch (error) {
      const code = (error as { data?: { code?: string } }).data?.code;
      setSaveStatus("error");
      toast.error(
        code === "CONFLICT"
          ? t.formatMessage({
              defaultMessage:
                "This version changed elsewhere. Your last edit was not saved.",
            })
          : (error as Error).message
      );
      latest.current = null;
      await refresh();
    } finally {
      inFlight.current = false;
    }
  }, [refresh, saveEdit, t, version.id]);

  const editor = useEditor({
    extensions: documentExtensions({ noteLabel }),
    content: blocksToDoc(initial),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "document-editor font-[Helvetica,Arial,sans-serif] text-sm leading-relaxed focus:outline-none"
        ),
        spellcheck: "true",
      },
      ...editorScrollMargins,
    },
    onUpdate: ({ editor: current, transaction }) => {
      if (!transaction.docChanged) return;
      clearTimeout(readTimer.current);
      readTimer.current = setTimeout(() => {
        const next = docToBlocks(current.state.doc);
        setBlocks(next);
        latest.current = next;
        setSaveStatus((status) => (status === "saving" ? status : "pending"));
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => void flush(), saveDelayMs);
      }, readDelayMs);
    },
  });

  // A new official snapshot from elsewhere (undo, restore, a generation, a
  // sync) replaces the text; our own save only refreshes the origins.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const content = editableContent(version);
    if (version.snapshot.id === base.current.snapshotId) {
      base.current.content = content;
      return;
    }
    if (inFlight.current) return;
    clearTimeout(saveTimer.current);
    base.current = { snapshotId: version.snapshot.id, content };
    latest.current = null;
    const next = contentToBlocks(content, version.language);
    resetDocument(editor, next);
    setBlocks(next);
    setSaveStatus("saved");
  }, [editor, version]);

  // Leaving the editor saves what is still waiting for its pause.
  useEffect(
    () => () => {
      clearTimeout(readTimer.current);
      clearTimeout(saveTimer.current);
      if (latest.current) void flush();
    },
    [flush]
  );

  // Optimistic: the keys change here first, then the server records them.
  const [dismissed, setDismissed] = useState(version.dismissedFindings);
  const serverDismissed = version.dismissedFindings.join();
  useEffect(() => {
    setDismissed(serverDismissed ? serverDismissed.split(",") : []);
  }, [serverDismissed]);
  const { mutate: dismissOnServer } = useMutation(
    trpc.documents.dismissFinding.mutationOptions()
  );
  const { mutate: restoreOnServer } = useMutation(
    trpc.documents.restoreFinding.mutationOptions()
  );
  const setKeyIgnored = (key: string, ignore: boolean) => {
    setDismissed((keys) =>
      ignore
        ? [...keys.filter((existing) => existing !== key), key]
        : keys.filter((existing) => existing !== key)
    );
    const revert = () =>
      setDismissed((keys) =>
        ignore ? keys.filter((existing) => existing !== key) : [...keys, key]
      );
    (ignore ? dismissOnServer : restoreOnServer)(
      { versionId: version.id, findingKey: key },
      { onError: revert }
    );
  };

  const { findings, ignoredFindings, notes, ignoredNotes } = useMemo(() => {
    const hidden = new Set(dismissed);
    const all = version.coverage?.findings ?? [];
    const review = version.coverage?.review;
    const allNotes: ReviewNote[] = [
      ...(review?.inconsistencies ?? []).map(
        (row): ReviewNote => ({
          kind: "inconsistency",
          lineId: row.lineId,
          lineText: row.lineText,
          text: row.explanation,
          profileSuggestion: null,
        })
      ),
      ...(review?.suggestions ?? []).map(
        (row): ReviewNote => ({
          kind: "suggestion",
          lineId: row.lineId,
          lineText: row.lineText,
          text: row.text,
          profileSuggestion:
            review && row.kind === "profile" && row.lineId
              ? { coverageReviewId: review.id, lineId: row.lineId }
              : null,
        })
      ),
    ];
    const ignoredFinding = (finding: DocumentFinding) =>
      isIgnorable(finding) && hidden.has(coverageFindingKey(finding));
    const ignoredNote = (note: ReviewNote) => hidden.has(reviewNoteKey(note));
    return {
      findings: all.filter((finding) => !ignoredFinding(finding)),
      ignoredFindings: all.filter(ignoredFinding),
      notes: allNotes.filter((note) => !ignoredNote(note)),
      ignoredNotes: allNotes.filter(ignoredNote),
    };
  }, [version.coverage, dismissed]);

  const content = editableContent(version);
  const lines = useMemo(() => linesById(content), [content]);

  const indexOfLine = useCallback(
    (lineId: string) =>
      blocks.findIndex((block) => "lineId" in block && block.lineId === lineId),
    [blocks]
  );
  const indexOfOwner = useCallback(
    (ownerId: string) =>
      blocks.findIndex(
        (block) => block.type === "entry" && block.ownerId === ownerId
      ),
    [blocks]
  );

  const goToBlock = useCallback(
    (index: number) => {
      if (editor && index >= 0) scrollToBlock(editor, index);
    },
    [editor]
  );

  const fixFor = useCallback(
    (finding: DocumentFinding) => {
      if (finding.code !== "publicName" || !finding.lineId || !editor) {
        return null;
      }
      const index = indexOfLine(finding.lineId);
      const block = blocks[index];
      if (!block || !("text" in block)) return null;
      const term = String(finding.params.term ?? "");
      const publicName = String(finding.params.publicName ?? "");
      if (!term || !publicName) return null;
      const pattern = new RegExp(escapeRegExp(term), "gi");
      if (!pattern.test(block.text)) return null;
      return () =>
        replaceBlockText(
          editor,
          index,
          block.text.replace(pattern, publicName)
        );
    },
    [blocks, editor, indexOfLine]
  );

  // What is drawn over the text: the trace colors, the findings' underlines
  // and the review's notes, placed again after every read of the blocks.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const { doc } = editor.state;
    const current = docToBlocks(doc);
    if (JSON.stringify(current) !== JSON.stringify(blocks)) return;
    const positions = blockPositions(doc);
    const specs: EditorDecorationSpec[] = [];
    const nodeOf = (index: number) => {
      const from = positions[index];
      const node = from === undefined ? null : doc.nodeAt(from);
      return node ? { from, to: from + node.nodeSize, node } : null;
    };
    if (trace) {
      blocks.forEach((block, index) => {
        if (!("lineId" in block)) return;
        const origin = lines.get(block.lineId)?.origin ?? { kind: "manual" };
        const range = nodeOf(index);
        if (!range) return;
        specs.push({
          kind: "node",
          from: range.from,
          to: range.to,
          className: cn(
            "-ml-2 rounded-sm border-l-2 pl-1.5",
            originTone[origin.kind]
          ),
          key: `trace-${index}`,
        });
      });
    }
    findings.forEach((finding, index) => {
      const key = `finding-${index}`;
      const blocking = !isWarningFinding(finding);
      const underline = cn(
        "underline decoration-wavy underline-offset-4",
        blocking ? "decoration-destructive" : "decoration-amber-500"
      );
      if (finding.lineId) {
        const at = indexOfLine(finding.lineId);
        const range = nodeOf(at);
        const block = blocks[at];
        if (!range || !block || !("text" in block)) return;
        const span = spanOf(block.text, finding) ?? {
          from: 0,
          to: block.text.length,
        };
        const start = range.from + 1;
        specs.push({
          kind: "inline",
          from: start + span.from,
          to: Math.min(
            start + Math.max(span.to, span.from + 1),
            start + block.text.length
          ),
          className: underline,
          finding: key,
          key,
        });
      } else if (finding.positionId) {
        const range = nodeOf(indexOfOwner(finding.positionId));
        if (!range) return;
        specs.push({
          kind: "node",
          from: range.from,
          to: range.to,
          className: cn(
            "-mx-2 rounded-sm px-2 ring-1",
            blocking ? "ring-destructive/50" : "ring-amber-500/50"
          ),
          finding: key,
          key,
        });
      }
    });
    notes.forEach((note, index) => {
      if (!note.lineId) return;
      const at = indexOfLine(note.lineId);
      const range = nodeOf(at);
      const block = blocks[at];
      if (!range || !block || !("text" in block) || !block.text) return;
      const key = `note-${index}`;
      specs.push({
        kind: "inline",
        from: range.from + 1,
        to: range.from + 1 + block.text.length,
        className: cn("bg-primary/10 rounded-sm"),
        finding: key,
        key,
      });
    });
    setDecorations(editor, specs);
  }, [
    editor,
    blocks,
    findings,
    notes,
    trace,
    lines,
    indexOfLine,
    indexOfOwner,
  ]);

  const value: DocumentEditorState = {
    editor,
    version,
    content,
    blocks,
    saveStatus,
    trace,
    setTrace,
    findings,
    ignoredFindings,
    notes,
    ignoredNotes,
    canIgnore: isIgnorable,
    ignoreFinding: (finding) =>
      isIgnorable(finding) && setKeyIgnored(coverageFindingKey(finding), true),
    restoreFinding: (finding) =>
      setKeyIgnored(coverageFindingKey(finding), false),
    ignoreNote: (note) => setKeyIgnored(reviewNoteKey(note), true),
    restoreNote: (note) => setKeyIgnored(reviewNoteKey(note), false),
    fixFor,
    goToBlock,
    goToLine: (lineId) => goToBlock(indexOfLine(lineId)),
    goToOwner: (ownerId) => goToBlock(indexOfOwner(ownerId)),
    addBullet: (ownerId) => editor && appendBullet(editor, ownerId),
  };

  return (
    <DocumentEditorContext.Provider value={value}>
      {children}
    </DocumentEditorContext.Provider>
  );
}
