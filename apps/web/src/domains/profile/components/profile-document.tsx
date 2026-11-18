"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { GripVertical, Plus, Sparkles } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import type { ProfileEntryKind } from "@repo/api/domains/profile/truth/insert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/web/components/ui/dropdown-menu";
import { cn } from "@repo/web/lib/utils";

import { useProfileLabels } from "../hooks/use-profile-labels";
import { blockPositions, isLockedNode } from "../utils/editor-doc";
import { EntryDialog } from "./entry-dialog";
import { FindingHoverCard } from "./finding-hover-card";
import { useProfileEditor } from "./profile-editor-context";

export const entryKinds: ProfileEntryKind[] = [
  "experience",
  "education",
  "certification",
  "competency",
  "language",
  "gap",
  "rule",
  "addendum",
];

type BlockKind = "heading2" | "heading3" | "item" | "paragraph";

/** The top-level DOM block under a vertical position, skipping hints. */
function blockAt(editor: Editor, clientY: number) {
  const children = Array.from(editor.view.dom.children) as HTMLElement[];
  for (const element of children) {
    if (element.hasAttribute("data-profile-aside")) continue;
    const rect = element.getBoundingClientRect();
    if (clientY >= rect.top - 4 && clientY <= rect.bottom + 4) {
      const pos = editor.view.posAtDOM(element, 0);
      const index = editor.state.doc.resolve(pos).index(0);
      return { element, index };
    }
  }
  return null;
}

function nodeStart(editor: Editor, index: number) {
  let start = 0;
  for (let i = 0; i < index; i++) start += editor.state.doc.child(i).nodeSize;
  return start;
}

/** Where a dragged block would land: the gap nearest to the pointer. */
function dropIndex(editor: Editor, clientY: number) {
  const children = (
    Array.from(editor.view.dom.children) as HTMLElement[]
  ).filter((element) => !element.hasAttribute("data-profile-aside"));
  for (let i = 0; i < children.length; i++) {
    const rect = children[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2)
      return { index: i, top: rect.top };
  }
  const last = children[children.length - 1]?.getBoundingClientRect();
  return { index: children.length, top: last ? last.bottom : 0 };
}

function moveBlock(editor: Editor, from: number, to: number) {
  if (to === from || to === from + 1) return;
  const node = editor.state.doc.child(from);
  // The title and the template's sections stay where they are.
  if (isLockedNode(node)) return;
  const start = nodeStart(editor, from);
  const tr = editor.state.tr.delete(start, start + node.nodeSize);
  const target = nodeStart(editor, to) - (to > from ? node.nodeSize : 0);
  tr.insert(target, node);
  editor.view.dispatch(tr.scrollIntoView());
}

function setBlockKind(editor: Editor, index: number, kind: BlockKind) {
  const start = nodeStart(editor, index) + 1;
  const chain = editor.chain().setTextSelection(start);
  if (kind === "heading2") chain.setNode("heading", { level: 2 }).run();
  else if (kind === "heading3") chain.setNode("heading", { level: 3 }).run();
  else if (kind === "item") chain.setNode("profileItem", { depth: 0 }).run();
  else chain.setNode("paragraph").run();
}

type SlashMenu = { query: string; from: number; left: number; top: number };

/**
 * The document: a block editor whose margin has a "+" (the insert menu) and
 * a handle to drag a block or change its kind, and where `/` opens the same
 * menu at the cursor (profile spec, "The editor").
 */
export function ProfileDocument() {
  const t = useTranslation();
  const { entryLabels, findingMessage } = useProfileLabels();
  const {
    editor,
    insert,
    talkAbout,
    entryOpenerRef,
    findings,
    reviewFindings,
    blocks,
    structure,
    fix,
  } = useProfileEditor();
  const [selection, setSelection] = useState<{
    text: string;
    line: number;
    left: number;
    top: number;
  } | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{ index: number; top: number } | null>(
    null
  );
  const [drag, setDrag] = useState<{ from: number; top: number | null } | null>(
    null
  );
  const [blockMenu, setBlockMenu] = useState<number | null>(null);
  const [dialog, setDialog] = useState<ProfileEntryKind | null>(null);
  const [slash, setSlash] = useState<SlashMenu | null>(null);

  // The "+ Add" buttons at the end of the sections open the same dialog.
  useEffect(() => {
    entryOpenerRef.current = setDialog;
    return () => {
      entryOpenerRef.current = null;
    };
  }, [entryOpenerRef]);
  const [slashIndex, setSlashIndex] = useState(0);

  const blockKinds: Array<{ kind: BlockKind; label: string }> = [
    { kind: "paragraph", label: t.formatMessage({ defaultMessage: "Text" }) },
    { kind: "item", label: t.formatMessage({ defaultMessage: "List item" }) },
    { kind: "heading2", label: t.formatMessage({ defaultMessage: "Section" }) },
    {
      kind: "heading3",
      label: t.formatMessage({ defaultMessage: "Subsection" }),
    },
  ];
  const slashOptions = [
    ...entryKinds.map((kind) => ({
      id: kind,
      label: entryLabels[kind],
      entry: kind,
    })),
    ...blockKinds.map((block) => ({
      id: block.kind,
      label: block.label,
      block: block.kind,
    })),
  ].filter((option) =>
    option.label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .includes(
        (slash?.query ?? "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
      )
  );

  // `/` at the start of a block or after a space opens the menu; typing
  // filters it and a space or leaving the block closes it.
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const { $from, empty } = editor.state.selection;
      if (!empty || !$from.parent.isTextblock) return setSlash(null);
      const before = $from.parent.textBetween(0, $from.parentOffset);
      const match = /(?:^|\s)\/([\p{L}\p{N}]*)$/u.exec(before);
      const box = wrapper.current?.getBoundingClientRect();
      if (!match || !box) return setSlash(null);
      const coords = editor.view.coordsAtPos($from.pos);
      setSlash((previous) => {
        if (previous?.query !== match[1]) setSlashIndex(0);
        return {
          query: match[1],
          from: $from.pos - match[1].length - 1,
          left: coords.left - box.left,
          top: coords.bottom - box.top + 4,
        };
      });
    };
    editor.on("transaction", update);
    return () => {
      editor.off("transaction", update);
    };
  }, [editor]);

  // Selected text gets a floating bar whose button sends the passage to
  // the agent (profile spec, "Selection").
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const { from, to, empty } = editor.state.selection;
      const box = wrapper.current?.getBoundingClientRect();
      const text = empty ? "" : editor.state.doc.textBetween(from, to, "\n");
      if (!text.trim() || !box || !editor.isFocused) return setSelection(null);
      const start = editor.view.coordsAtPos(from);
      setSelection({
        text: text.trim(),
        // The document line the selection starts in.
        line: Math.max(
          blockPositions(editor.state.doc).findLastIndex(
            (position) => position <= from
          ),
          0
        ),
        left: Math.max(start.left - box.left, 64),
        top: start.top - box.top - 36,
      });
    };
    editor.on("selectionUpdate", update);
    editor.on("blur", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("blur", update);
    };
  }, [editor]);

  const chooseSlash = useCallback(
    (option: (typeof slashOptions)[number] | undefined) => {
      if (!editor || !slash || !option) return;
      editor
        .chain()
        .deleteRange({ from: slash.from, to: editor.state.selection.from })
        .run();
      setSlash(null);
      if ("entry" in option && option.entry) setDialog(option.entry);
      else if ("block" in option && option.block) {
        setBlockKind(
          editor,
          editor.state.selection.$from.index(0),
          option.block
        );
        editor.commands.focus();
      }
    },
    [editor, slash]
  );

  // The menu takes the arrows, Enter and Escape while it's open.
  useEffect(() => {
    if (!editor || !slash) return;
    const keys = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        setSlashIndex((i) => Math.min(i + 1, slashOptions.length - 1));
      } else if (event.key === "ArrowUp") {
        setSlashIndex((i) => Math.max(i - 1, 0));
      } else if (event.key === "Enter") {
        chooseSlash(slashOptions[slashIndex]);
      } else if (event.key === "Escape") {
        setSlash(null);
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    const dom = editor.view.dom;
    dom.addEventListener("keydown", keys, true);
    return () => dom.removeEventListener("keydown", keys, true);
  }, [editor, slash, slashIndex, slashOptions, chooseSlash]);

  // The title and the template's sections have no handle: they don't move.
  const lockedHovered =
    !!editor &&
    !!hovered &&
    hovered.index < editor.state.doc.childCount &&
    isLockedNode(editor.state.doc.child(hovered.index));

  function track(event: React.MouseEvent) {
    if (!editor || drag || blockMenu !== null) return;
    const box = wrapper.current?.getBoundingClientRect();
    const block = blockAt(editor, event.clientY);
    if (!block || !box) return;
    const rect = block.element.getBoundingClientRect();
    setHovered({ index: block.index, top: rect.top - box.top });
  }

  function startDrag(event: ReactPointerEvent) {
    if (!editor || !hovered) return;
    event.preventDefault();
    const from = hovered.index;
    const startY = event.clientY;
    let moved = false;
    setDrag({ from, top: null });
    const onMove = (move: PointerEvent) => {
      if (Math.abs(move.clientY - startY) > 4) moved = true;
      if (!moved) return;
      const box = wrapper.current?.getBoundingClientRect();
      const target = dropIndex(editor, move.clientY);
      setDrag({ from, top: box ? target.top - box.top : null });
    };
    const onUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDrag(null);
      if (moved) moveBlock(editor, from, dropIndex(editor, up.clientY).index);
      else setBlockMenu(from);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      ref={wrapper}
      className="relative mx-auto w-full max-w-3xl py-8 pr-6 pl-16"
      onMouseMove={track}
      onMouseLeave={() => !drag && blockMenu === null && setHovered(null)}
    >
      {hovered && editor && (
        <div
          className="absolute left-4 flex items-center gap-0.5"
          style={{ top: hovered.top }}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t.formatMessage({
                  defaultMessage: "Add to the profile",
                })}
                className="text-muted-foreground hover:bg-muted flex size-6 items-center justify-center rounded"
              >
                <Plus className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>
                {t.formatMessage({ defaultMessage: "Add to the profile" })}
              </DropdownMenuLabel>
              {entryKinds.map((kind) => (
                <DropdownMenuItem key={kind} onSelect={() => setDialog(kind)}>
                  {entryLabels[kind]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {!lockedHovered && (
            <DropdownMenu
              open={blockMenu !== null}
              onOpenChange={(open) => !open && setBlockMenu(null)}
            >
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t.formatMessage({
                    defaultMessage: "Drag to move, click for options",
                  })}
                  className="text-muted-foreground hover:bg-muted flex size-6 cursor-grab touch-none items-center justify-center rounded active:cursor-grabbing"
                  onPointerDown={startDrag}
                  onClick={(event) => event.preventDefault()}
                >
                  <GripVertical className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>
                  {t.formatMessage({ defaultMessage: "Turn into" })}
                </DropdownMenuLabel>
                {blockKinds.map((block) => (
                  <DropdownMenuItem
                    key={block.kind}
                    onSelect={() =>
                      blockMenu !== null &&
                      setBlockKind(editor, blockMenu, block.kind)
                    }
                  >
                    {block.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    if (blockMenu === null) return;
                    const start = nodeStart(editor, blockMenu);
                    const node = editor.state.doc.child(blockMenu);
                    editor.view.dispatch(
                      editor.state.tr.delete(start, start + node.nodeSize)
                    );
                    setHovered(null);
                  }}
                >
                  {t.formatMessage({ defaultMessage: "Delete" })}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
      {drag?.top !== null && drag?.top !== undefined && (
        <div
          className="bg-primary pointer-events-none absolute right-6 left-16 h-0.5 rounded"
          style={{ top: drag.top - 1 }}
        />
      )}
      {selection && (
        <button
          type="button"
          className="bg-popover text-popover-foreground hover:bg-accent absolute z-20 flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium shadow-md"
          style={{ left: selection.left, top: selection.top }}
          // The selection stays while the button is pressed.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            talkAbout({ quote: selection.text, line: selection.line });
            setSelection(null);
          }}
        >
          <Sparkles className="text-primary size-3.5" />
          {t.formatMessage({ defaultMessage: "Talk about this" })}
        </button>
      )}
      <EditorContent editor={editor} />
      <FindingHoverCard
        editor={editor}
        describe={(key) => {
          const [group, number] = key.split("-");
          const index = Number(number);
          if (group === "review") {
            const finding = reviewFindings[index];
            if (!finding) return null;
            return {
              message: finding.message,
              talk: () =>
                talkAbout({
                  quote: blocks[finding.line]?.text ?? "",
                  line: finding.line,
                  text: finding.message,
                }),
            };
          }
          const finding = findings[index];
          if (!finding) return null;
          const message = findingMessage(finding, structure.language);
          const line = finding.line;
          return {
            message,
            finding,
            fix: finding.fixable ? () => fix(finding) : undefined,
            talk:
              line === null
                ? undefined
                : () =>
                    talkAbout({
                      quote: blocks[line]?.text ?? "",
                      line,
                      text: message,
                    }),
          };
        }}
      />
      {slash && slashOptions.length > 0 && (
        <div
          className="bg-popover text-popover-foreground absolute z-20 w-64 overflow-hidden rounded-md border p-1 shadow-md"
          style={{ left: slash.left, top: slash.top }}
          role="listbox"
        >
          {slashOptions.map((option, index) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={index === slashIndex}
              className={cn(
                "w-full rounded-sm px-2 py-1.5 text-left text-sm",
                index === slashIndex && "bg-accent text-accent-foreground"
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                chooseSlash(option);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      <EntryDialog
        kind={dialog}
        onClose={() => setDialog(null)}
        onInsert={(entry) => {
          setDialog(null);
          insert(entry);
        }}
      />
    </div>
  );
}
