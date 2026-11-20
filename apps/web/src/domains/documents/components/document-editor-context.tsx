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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEditor, type Editor } from "@tiptap/react";

import { sectionMoveOf } from "@repo/api/domains/documents/changes/section-order";
import {
  coverageFindingKey,
  reviewNoteKey,
} from "@repo/api/domains/documents/coverage-review/finding-key";
import type { ResumeSectionKind } from "@repo/api/domains/documents/schemas/resume-content";
import type { ListedDocumentChange } from "@repo/api/domains/documents/schemas/document-change";
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
import { lineDiff } from "~/domains/profile/utils/word-diff";

import { useRefreshDocuments } from "../hooks/use-opening-documents";
import {
  changeWidget,
  removedWordsClass,
  replacedBlockClass,
  sectionMoveWidget,
} from "../utils/change-widget";
import { locateChangeInBlocks } from "../utils/document-changes";
import { findPassage, type PassageTarget } from "../utils/passages";
import {
  blocksToContent,
  contentToBlocks,
  linesById,
  moveSectionBlocks,
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
  selectBlock,
} from "../utils/document-editor-extensions";
import { useDocumentAgent } from "./document-agent-context";
import { originMarker } from "./editing";

const infoIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';

export type DocumentFinding = CoverageView["findings"][number];

/** A change the agent proposed, with the blocks it replaces now (null when stale). */
export type LocatedChange = ListedDocumentChange & {
  range: { start: number; end: number } | null;
};

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

/**
 * What a "not in your profile" finding offers: adding the line to the
 * profile's draft, or, once sent, where it stands there.
 */
export type ProfileCheckReason = {
  // The line as it was checked: the reason is stale once the text changes.
  text: string;
  missing: string;
  figures: string[];
};

export type ProfileAction =
  | { kind: "add"; run: () => void; pending: boolean }
  // "Add translation" of a "not translated" finding: the field as printed,
  // and the wording the user gives for the document's language.
  | {
      kind: "translate";
      original: string;
      run: (translation: string) => void;
      pending: boolean;
    }
  | { kind: "sent"; status: "pending" | "accepted" };

type DocumentEditorState = {
  editor: Editor | null;
  version: VersionView;
  content: EditableContent;
  blocks: DocumentBlock[];
  saveStatus: SaveStatus;
  /** The code checks that count: ignored findings are left out. */
  findings: DocumentFinding[];
  ignoredFindings: DocumentFinding[];
  notes: ReviewNote[];
  ignoredNotes: ReviewNote[];
  /** The key the text marks a finding or a note with (`data-finding`). */
  findingKey: (finding: DocumentFinding) => string;
  noteKey: (note: ReviewNote) => string;
  /** The finding under the pointer in the text, or the last one opened. */
  activeFinding: string | null;
  /** The finding whose row the pointer is on: its passage lights up. */
  hoverFinding: (key: string | null) => void;
  /** The passage a finding or a note points at, as the line's text. */
  passageOf: (target: {
    lineId: string | null;
    positionId?: string | null;
  }) => string | null;
  ignoreFinding: (finding: DocumentFinding) => void;
  restoreFinding: (finding: DocumentFinding) => void;
  ignoreNote: (note: ReviewNote) => void;
  restoreNote: (note: ReviewNote) => void;
  /** The one-click fix of a finding, when code has one. */
  fixFor: (finding: DocumentFinding) => (() => void) | null;
  /** "Add to the profile" of a "not in your profile" finding. */
  profileActionFor: (finding: DocumentFinding) => ProfileAction | null;
  /**
   * "Check against my profile": a small AI check of the lines the profile
   * doesn't back against the profile published now (the given lines, or all
   * of them). The ones it backs are traced; the others keep the finding.
   */
  checkProfile: (lineIds?: string[]) => void;
  /** The check is running, or the document can't take it yet. */
  checkingProfile: boolean;
  profileCheckBusy: boolean;
  /** Why a checked line is still not in the profile, by line id. */
  profileCheckReasons: Map<string, ProfileCheckReason>;
  /** Scrolls to a block and selects its text (or the given span of it). */
  goToBlock: (index: number, range?: { from: number; to: number }) => void;
  goToLine: (lineId: string, range?: { from: number; to: number }) => void;
  goToOwner: (ownerId: string) => void;
  /** Opens a finding or a note: its passage selected, its row active. */
  goToFinding: (finding: DocumentFinding) => void;
  goToNote: (note: ReviewNote) => void;
  addBullet: (ownerId: string) => void;
  /**
   * Moves a section, with its content, to a place among the sections (the
   * header stays first). Saved at once as a snapshot of its own, so undo
   * restores the old order.
   */
  moveSection: (kind: ResumeSectionKind, toIndex: number) => void;
  /** The agent's changes waiting in the text (ADR 0009). */
  changes: LocatedChange[];
  acceptChanges: (documentChangeIds?: string[]) => void;
  rejectChanges: (documentChangeIds?: string[]) => void;
  /**
   * Saves a change made outside the text (choosing a LinkedIn headline
   * option, a language's level) over what is saved, as a snapshot; the
   * new snapshot then replaces the editor's text.
   */
  saveContent: (change: (content: EditableContent) => EditableContent) => void;
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

const editableContent = (version: VersionView): EditableContent =>
  version.content;

/**
 * Holds the document's editor (resume spec, "Document workspace"): the
 * snapshot as blocks, edits saved as snapshots after a pause, the findings
 * drawn over the text and the ones the user ignored, every line's origin
 * marked. Keyed by version: another version is another editor.
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
  const queryClient = useQueryClient();
  const refresh = useRefreshDocuments();
  const agent = useDocumentAgent();
  const hoveredPassage = agent?.hoveredPassage ?? null;
  const initial = useMemo(
    () => contentToBlocks(editableContent(version), version.language),
    // The editor starts from the version it was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [blocks, setBlocks] = useState(initial);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [activeFinding, setActiveFinding] = useState<string | null>(null);
  const [hoveredFinding, setHoveredFinding] = useState<string | null>(null);
  // The snapshot the editor's text is written over.
  const base = useRef({
    snapshotId: version.snapshot.id,
    content: editableContent(version),
  });
  const latest = useRef<DocumentBlock[] | null>(null);
  const readTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inFlight = useRef(false);
  // The save under way, for an action that must start from what is saved.
  const flushing = useRef<Promise<void>>(Promise.resolve());
  const { mutateAsync: saveEdit } = useMutation(
    trpc.documents.saveEdit.mutationOptions()
  );

  const notePrefix = t.formatMessage({ defaultMessage: "Included for:" });
  const markerLabel = t.formatMessage({
    defaultMessage: "Where this line comes from",
  });

  /** Saves until what is saved is the latest text. */
  const flush = useCallback(async () => {
    if (inFlight.current) return flushing.current;
    inFlight.current = true;
    let done!: () => void;
    flushing.current = new Promise<void>((resolve) => (done = resolve));
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
      done();
    }
  }, [refresh, saveEdit, t, version.id]);

  const editor = useEditor({
    extensions: documentExtensions({
      notePrefix,
      placeholders: {
        headline: t.formatMessage({
          defaultMessage: "Write your headline, or pick an option above",
        }),
        description: t.formatMessage({
          defaultMessage: "Add a short description (optional)",
        }),
      },
    }),
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

  const moveSection = useCallback(
    (kind: ResumeSectionKind, toIndex: number) => {
      if (!editor || editor.isDestroyed) return;
      const next = moveSectionBlocks(
        docToBlocks(editor.state.doc),
        kind,
        toIndex
      );
      if (!next) return;
      clearTimeout(readTimer.current);
      clearTimeout(saveTimer.current);
      resetDocument(editor, next);
      setBlocks(next);
      latest.current = next;
      setSaveStatus("pending");
      void flush();
    },
    [editor, flush]
  );

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
      hidden.has(coverageFindingKey(finding));
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

  // The block a review quote points at: its line, or else the line whose
  // text holds the quote (or is held by it), whitespace and quotes aside.
  const indexOfPassage = useCallback(
    (target: PassageTarget) => findPassage(blocks, target),
    [blocks]
  );

  const goToBlock = useCallback(
    (index: number, range?: { from: number; to: number }) => {
      if (editor && index >= 0) selectBlock(editor, index, range);
    },
    [editor]
  );
  const findingKey = useCallback(
    (finding: DocumentFinding) => `finding-${findings.indexOf(finding)}`,
    [findings]
  );
  const noteKey = useCallback(
    (note: ReviewNote) => `note-${notes.indexOf(note)}`,
    [notes]
  );
  const passageOf = useCallback(
    (target: { lineId: string | null; positionId?: string | null }) => {
      if (target.lineId) return lines.get(target.lineId)?.text ?? null;
      const entry = blocks.find(
        (block) => block.type === "entry" && block.ownerId === target.positionId
      );
      return entry && "text" in entry ? entry.text : null;
    },
    [blocks, lines]
  );
  const goToFinding = useCallback(
    (finding: DocumentFinding) => {
      setActiveFinding(findingKey(finding));
      if (finding.lineId) {
        const at = indexOfLine(finding.lineId);
        const block = blocks[at];
        const span =
          block && "text" in block ? spanOf(block.text, finding) : null;
        goToBlock(at, span ?? undefined);
      } else if (finding.positionId) {
        goToBlock(indexOfOwner(finding.positionId));
      }
    },
    [blocks, findingKey, goToBlock, indexOfLine, indexOfOwner]
  );
  const goToNote = useCallback(
    (note: ReviewNote) => {
      setActiveFinding(noteKey(note));
      goToBlock(indexOfPassage(note));
    },
    [goToBlock, indexOfPassage, noteKey]
  );

  // The review beside the text (another column) finds its quotes among
  // these lines, lights one up and opens it.
  const setPassages = agent?.setPassages;
  const passageHooks = agent?.passageHooks;
  useEffect(() => {
    setPassages?.(
      blocks.flatMap((block) =>
        "lineId" in block ? [{ lineId: block.lineId, text: block.text }] : []
      )
    );
  }, [blocks, setPassages]);
  useEffect(() => {
    if (!passageHooks) return;
    passageHooks.current = {
      goTo: (target) => goToBlock(indexOfPassage(target)),
    };
    return () => {
      passageHooks.current = null;
    };
  }, [passageHooks, goToBlock, indexOfPassage]);

  // The finding under the pointer in the text becomes the active one, so
  // the list shows which row the underline belongs to.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const dom = editor.view.dom;
    const over = (event: MouseEvent) => {
      const element = (
        event.target as HTMLElement | null
      )?.closest<HTMLElement>("[data-finding]");
      if (element?.dataset.finding) setActiveFinding(element.dataset.finding);
    };
    dom.addEventListener("mouseover", over);
    return () => dom.removeEventListener("mouseover", over);
  }, [editor]);

  // The changes the agent proposed, each located in the text as it is now.
  const changesQuery = useQuery(
    trpc.documents.changes.queryOptions({ versionId: version.id })
  );
  const changes = useMemo<LocatedChange[]>(
    () =>
      (changesQuery.data ?? []).map((change) => ({
        ...change,
        range: locateChangeInBlocks(blocks, change),
      })),
    [changesQuery.data, blocks]
  );
  const latestChanges = useRef(changes);
  latestChanges.current = changes;
  const latestBlocks = useRef(blocks);
  latestBlocks.current = blocks;
  const changesKey = trpc.documents.changes.queryKey({ versionId: version.id });
  const forgetChanges = (ids: string[]) =>
    queryClient.setQueryData(
      changesKey,
      (current: ListedDocumentChange[] | undefined) =>
        current?.filter((change) => !ids.includes(change.id))
    );
  const refreshChanges = useCallback(
    () => queryClient.invalidateQueries({ queryKey: changesKey }),
    // The key is a new array on every render, built from the version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, version.id]
  );
  const { mutateAsync: acceptOnServer } = useMutation(
    trpc.documents.acceptChanges.mutationOptions()
  );
  const { mutate: rejectOnServer } = useMutation(
    trpc.documents.rejectChanges.mutationOptions()
  );
  const changesNotRecorded = () => {
    void refreshChanges();
    toast.error(
      t.formatMessage({
        defaultMessage:
          "Your answer to the suggestion couldn't be saved. Try again.",
      })
    );
  };
  /**
   * Accepts the given changes (all of them by default): the server writes
   * a snapshot per change over what is saved, so the text is saved first;
   * the new official snapshot then replaces the editor's text. Changes
   * whose lines are gone stay waiting.
   */
  const acceptChanges = async (
    documentChangeIds?: string[],
    // The lines the user wrote in place of a change's, by change id.
    editedReplacements?: Record<string, string>
  ) => {
    const ids = documentChangeIds ?? changes.map((change) => change.id);
    if (!ids.length) return;
    await flush();
    try {
      const result = await acceptOnServer({
        versionId: version.id,
        baseSnapshotId: base.current.snapshotId,
        documentChangeIds: ids,
        editedReplacements,
      });
      forgetChanges(result.accepted);
      // The others are located again: one whose lines moved is now stale.
      void refreshChanges();
      if (!result.accepted.length) {
        toast.error(
          t.formatMessage({
            defaultMessage:
              "The text changed since this was suggested, so it can't be applied. Reject it, or ask the agent again.",
          })
        );
      }
      await refresh();
    } catch (error) {
      const code = (error as { data?: { code?: string } }).data?.code;
      if (code === "CONFLICT") {
        toast.error(
          t.formatMessage({
            defaultMessage:
              "This version changed elsewhere. Your last edit was not saved.",
          })
        );
        await refresh();
      } else {
        changesNotRecorded();
      }
    }
  };
  const rejectChanges = (documentChangeIds?: string[]) => {
    const ids = documentChangeIds ?? changes.map((change) => change.id);
    if (!ids.length) return;
    forgetChanges(ids);
    rejectOnServer(
      { versionId: version.id, documentChangeIds: ids },
      { onError: changesNotRecorded }
    );
  };
  const saveContent = async (
    change: (content: EditableContent) => EditableContent
  ) => {
    await flush();
    setSaveStatus("saving");
    try {
      // Not the editor's text: the new snapshot replaces it, as one from
      // elsewhere does.
      await saveEdit({
        versionId: version.id,
        baseSnapshotId: base.current.snapshotId,
        content: change(base.current.content),
      });
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("error");
      toast.error((error as Error).message);
    }
    await refresh();
  };
  // The widgets in the text call the latest handlers.
  const changeHandlers = useRef<{
    accept: (documentChangeId: string, edited?: string) => void;
    reject: (documentChangeId: string) => void;
  } | null>(null);
  changeHandlers.current = {
    accept: (documentChangeId, edited) =>
      void acceptChanges(
        [documentChangeId],
        edited === undefined ? undefined : { [documentChangeId]: edited }
      ),
    reject: (documentChangeId) => rejectChanges([documentChangeId]),
  };
  const changeLabels = {
    accept: t.formatMessage({ defaultMessage: "Accept" }),
    reject: t.formatMessage({ defaultMessage: "Reject" }),
    removal: t.formatMessage({ defaultMessage: "Remove the line above" }),
    edit: t.formatMessage({ defaultMessage: "Edit" }),
    acceptEdited: t.formatMessage({ defaultMessage: "Accept edited" }),
    cancel: t.formatMessage({ defaultMessage: "Cancel" }),
  };

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

  // "Add to the profile": the line becomes a suggestion in the profile's
  // draft; the view then shows it as sent.
  const addToProfile = useMutation(
    trpc.documents.addLineToProfile.mutationOptions({
      onSuccess: () => {
        toast.success(
          t.formatMessage({
            defaultMessage:
              "Sent to your profile: accept it in My career, then publish.",
          })
        );
        void refresh();
      },
      onError: (error) =>
        toast.error(
          error.data?.code === "CONFLICT"
            ? t.formatMessage({
                defaultMessage: "Your profile already has this line.",
              })
            : t.formatMessage({
                defaultMessage: "This line couldn't be sent to your profile.",
              })
        ),
    })
  );
  const { mutate: sendLine, isPending: sending } = addToProfile;
  const [profileCheckReasons, setProfileCheckReasons] = useState(
    () => new Map<string, ProfileCheckReason>()
  );
  const profileCheck = useMutation(
    trpc.documents.checkAgainstProfile.mutationOptions({
      onSuccess: async ({ lines, profileVersionNumber }) => {
        const textOf = new Map(
          findings.flatMap((finding) =>
            finding.lineId ? [[finding.lineId, finding.text] as const] : []
          )
        );
        setProfileCheckReasons((previous) => {
          const next = new Map(previous);
          for (const line of lines) {
            if (line.backed) next.delete(line.lineId);
            else
              next.set(line.lineId, {
                text: textOf.get(line.lineId) ?? "",
                missing: line.missing,
                figures: line.figures,
              });
          }
          return next;
        });
        await refresh();
        const backed = lines.filter((line) => line.backed).length;
        toast.success(
          lines.length === 0
            ? t.formatMessage({
                defaultMessage: "No line needed checking.",
              })
            : t.formatMessage(
                {
                  defaultMessage:
                    "Checked against profile version {number}: {backed, plural, =0 {no line is} one {# line is} other {# lines are}} backed by it.",
                },
                { number: profileVersionNumber, backed }
              )
        );
      },
      onError: (error) =>
        toast.error(
          error.data?.code === "CONFLICT"
            ? t.formatMessage({
                defaultMessage:
                  "The document changed while checking: try again.",
              })
            : t.formatMessage({
                defaultMessage: "The check against your profile failed.",
              })
        ),
    })
  );
  const { mutate: runProfileCheck } = profileCheck;
  const checkProfile = useCallback(
    (lineIds?: string[]) => runProfileCheck({ versionId: version.id, lineIds }),
    [runProfileCheck, version.id]
  );
  // "Add translation": the entry becomes a suggestion on the profile's
  // translations line for this language.
  const addTranslation = useMutation(
    trpc.documents.addTranslationToProfile.mutationOptions({
      onSuccess: () => {
        toast.success(
          t.formatMessage({
            defaultMessage:
              "Sent to your profile: accept it in My career, then publish and use the new version here.",
          })
        );
        void refresh();
      },
      onError: () =>
        toast.error(
          t.formatMessage({
            defaultMessage:
              "This translation couldn't be sent to your profile.",
          })
        ),
    })
  );
  const { mutate: sendTranslation, isPending: sendingTranslation } =
    addTranslation;
  const profileActionFor = useCallback(
    (finding: DocumentFinding): ProfileAction | null => {
      if (finding.code === "untranslated") {
        const sent = version.sentTranslations.find(
          (row) => row.original === finding.text
        );
        if (sent) return { kind: "sent", status: sent.status };
        return {
          kind: "translate",
          original: finding.text,
          pending: sendingTranslation,
          run: (translation) =>
            sendTranslation({
              versionId: version.id,
              original: finding.text,
              translation,
            }),
        };
      }
      const lineId = finding.lineId;
      if (finding.code !== "notInProfile" || !lineId) return null;
      const sent = version.sentToProfile.find((row) => row.lineId === lineId);
      if (sent) return { kind: "sent", status: sent.status };
      return {
        kind: "add",
        pending: sending,
        run: () => sendLine({ versionId: version.id, lineId }),
      };
    },
    [
      sendLine,
      sending,
      sendTranslation,
      sendingTranslation,
      version.id,
      version.sentToProfile,
      version.sentTranslations,
    ]
  );

  // What is drawn over the text: the origin markers, the findings'
  // underlines and the review's notes, placed again after every read of
  // the blocks. The finding whose row is hovered lights its passage up.
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
    blocks.forEach((block, index) => {
      if (!("lineId" in block)) return;
      const origin = lines.get(block.lineId)?.origin ?? { kind: "manual" };
      const range = nodeOf(index);
      if (!range) return;
      specs.push({
        kind: "node",
        from: range.from,
        to: range.to,
        className: cn("-ml-2 border-l-2 pl-1.5", originMarker[origin.kind]),
        key: `trace-${index}`,
      });
      const size = range.node.content.size;
      specs.push({
        kind: "widget",
        at: range.from + 1 + size,
        interactive: true,
        element: () => {
          const marker = document.createElement("span");
          marker.className = cn(
            "text-muted-foreground/60 hover:text-foreground focus-visible:text-foreground ml-1 inline-flex size-3.5 cursor-help align-[-2px] select-none focus-visible:outline-none"
          );
          // lucide's Info icon, as markup: the widget is plain DOM.
          marker.innerHTML = infoIcon;
          marker.tabIndex = 0;
          marker.contentEditable = "false";
          marker.dataset.traceMarker = block.lineId;
          marker.setAttribute("aria-label", markerLabel);
          return marker;
        },
        key: `marker-${block.lineId}-${origin.kind}`,
      });
    });
    const lit = (key: string) =>
      key === hoveredFinding ? "bg-amber-500/20 rounded-sm" : "";
    findings.forEach((finding, index) => {
      const key = `finding-${index}`;
      const underline = cn(
        "underline decoration-amber-500/70 decoration-dotted decoration-2 underline-offset-4",
        lit(key)
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
            "-mx-2 rounded-sm px-2 ring-1 ring-amber-500/50",
            lit(key)
          ),
          finding: key,
          key,
        });
      }
    });
    // Each change as a tracked change: the lines it replaces struck
    // through, and what it writes below them with Accept and Reject.
    for (const change of changes) {
      const { range } = change;
      if (!range) continue;
      const move = sectionMoveOf(change);
      if (move) {
        // A section move is a banner on the section's title.
        const titleOf = (kind: string) =>
          blocks.find(
            (block) => block.type === "sectionTitle" && block.kind === kind
          );
        const anchor = titleOf(move.anchor);
        const summary = t.formatMessage(
          {
            defaultMessage:
              "{placement, select, above {Suggested: move this section above {anchor}} other {Suggested: move this section below {anchor}}}",
          },
          {
            placement: move.placement,
            anchor: anchor && "text" in anchor ? anchor.text : move.anchor,
          }
        );
        specs.push({
          kind: "widget",
          at: positions[range.start],
          interactive: true,
          element: () =>
            sectionMoveWidget(change, summary, changeLabels, {
              accept: (documentChangeId) =>
                changeHandlers.current?.accept(documentChangeId),
              reject: (documentChangeId) =>
                changeHandlers.current?.reject(documentChangeId),
            }),
          key: `change-${change.id}`,
        });
        continue;
      }
      const replaced = blocks
        .slice(range.start, range.end)
        .map((block) =>
          block.type === "skill"
            ? `${block.label}: ${block.text}`
            : "text" in block
              ? block.text
              : ""
        );
      const diff = lineDiff(
        replaced,
        change.replace.split("\n").filter((line) => line.trim())
      );
      for (let line = range.start; line < range.end; line++) {
        const node = nodeOf(line);
        if (!node) continue;
        specs.push({
          kind: "node",
          from: node.from,
          to: node.to,
          className: replacedBlockClass(diff.fallback),
          key: `change-old-${change.id}-${line}`,
        });
        if (diff.fallback) continue;
        // Only the removed words are struck; the rest stays readable. A
        // skills line's label is printed by the node, not in its text.
        const block = blocks[line];
        const skip = block.type === "skill" ? `${block.label}: `.length : 0;
        let offset = node.from + 1 - skip;
        for (const segment of diff.old[line - range.start] ?? []) {
          const from = Math.max(offset, node.from + 1);
          const to = offset + segment.text.length;
          if (segment.changed && to > from) {
            specs.push({
              kind: "inline",
              from,
              to,
              className: removedWordsClass,
              key: `change-removed-${change.id}-${offset}`,
            });
          }
          offset += segment.text.length;
        }
      }
      specs.push({
        kind: "widget",
        at:
          range.end < positions.length
            ? positions[range.end]
            : doc.content.size,
        interactive: true,
        element: () =>
          changeWidget(change, replaced, changeLabels, {
            accept: (documentChangeId, edited) =>
              changeHandlers.current?.accept(documentChangeId, edited),
            reject: (documentChangeId) =>
              changeHandlers.current?.reject(documentChangeId),
          }),
        key: `change-${change.id}`,
      });
    }
    notes.forEach((note, index) => {
      const at = indexOfPassage(note);
      if (at < 0) return;
      const range = nodeOf(at);
      const block = blocks[at];
      if (!range || !block || !("text" in block) || !block.text) return;
      const key = `note-${index}`;
      specs.push({
        kind: "inline",
        from: range.from + 1,
        to: range.from + 1 + block.text.length,
        className: cn("bg-primary/10 rounded-sm", lit(key)),
        finding: key,
        key,
      });
    });
    if (hoveredPassage) {
      const at = indexOfPassage(hoveredPassage);
      const range = at >= 0 ? nodeOf(at) : null;
      const block = blocks[at];
      if (range && block && "text" in block && block.text) {
        specs.push({
          kind: "inline",
          from: range.from + 1,
          to: range.from + 1 + block.text.length,
          className: "bg-amber-500/20 rounded-sm",
          key: "hovered-passage",
        });
      }
    }
    setDecorations(editor, specs);
    // The labels are the same strings on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    editor,
    blocks,
    findings,
    notes,
    changes,
    hoveredFinding,
    hoveredPassage,
    lines,
    indexOfLine,
    indexOfPassage,
    indexOfOwner,
  ]);

  // What the agent's panel needs about the changes: which wait, a fresh
  // read of them placed in the text, and a way to show one.
  useEffect(() => {
    if (!agent) return;
    const hooks = agent.changeHooks;
    hooks.current = {
      pendingIds: () => latestChanges.current.map((change) => change.id),
      refresh: async () => {
        const fresh = await queryClient.fetchQuery({
          ...trpc.documents.changes.queryOptions({ versionId: version.id }),
          staleTime: 0,
        });
        return fresh.map((change) => ({
          id: change.id,
          range: locateChangeInBlocks(latestBlocks.current, change),
        }));
      },
      show: (documentChangeId) => {
        const found = latestChanges.current.find(
          (change) => change.id === documentChangeId
        );
        if (!found?.range || !editor || editor.isDestroyed) return;
        const { start, end } = found.range;
        // An addition sits after the part's last line.
        scrollToBlock(editor, end > start ? start : Math.max(0, start - 1));
      },
    };
    return () => {
      hooks.current = null;
    };
  }, [agent, editor, queryClient, trpc, version.id]);

  const value: DocumentEditorState = {
    editor,
    version,
    content,
    blocks,
    saveStatus,
    findings,
    ignoredFindings,
    notes,
    ignoredNotes,
    findingKey,
    noteKey,
    activeFinding,
    hoverFinding: setHoveredFinding,
    passageOf,
    ignoreFinding: (finding) =>
      setKeyIgnored(coverageFindingKey(finding), true),
    restoreFinding: (finding) =>
      setKeyIgnored(coverageFindingKey(finding), false),
    ignoreNote: (note) => setKeyIgnored(reviewNoteKey(note), true),
    restoreNote: (note) => setKeyIgnored(reviewNoteKey(note), false),
    fixFor,
    profileActionFor,
    checkProfile,
    checkingProfile: profileCheck.isPending,
    profileCheckBusy: profileCheck.isPending || saveStatus !== "saved",
    profileCheckReasons,
    goToBlock,
    goToLine: (lineId, range) => goToBlock(indexOfLine(lineId), range),
    goToOwner: (ownerId) => goToBlock(indexOfOwner(ownerId)),
    goToFinding,
    goToNote,
    addBullet: (ownerId) => editor && appendBullet(editor, ownerId),
    moveSection,
    changes,
    acceptChanges: (documentChangeIds) => void acceptChanges(documentChangeIds),
    rejectChanges,
    saveContent: (change) => void saveContent(change),
  };

  return (
    <DocumentEditorContext.Provider value={value}>
      {children}
    </DocumentEditorContext.Provider>
  );
}
