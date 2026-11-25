import {
  Extension,
  Node,
  textblockTypeInputRule,
  type Editor,
} from "@tiptap/core";
import { Slice } from "@tiptap/pm/model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";

import { cn } from "@repo/web/lib/utils";
import {
  parseBlocks,
  serializeBlocks,
} from "@repo/api/domains/profile/truth/blocks";

import { findLinks } from "./find-links";
import {
  blocksToDoc,
  docToBlocks,
  introNote,
  introNoteOffsets,
  isLockedNode,
  lockedNodeOffsets,
  sameLockedHeadings,
} from "./editor-doc";

// Nesting deeper than this is no longer a list the method writes.
const maxDepth = 4;

/** A list item with its indentation depth: one Markdown line `- …`. */
export const ProfileItem = Node.create({
  name: "profileItem",
  group: "block",
  content: "text*",
  defining: true,
  addAttributes() {
    return {
      depth: {
        default: 0,
        parseHTML: (element) => Number(element.getAttribute("data-depth") ?? 0),
        renderHTML: (attributes) => ({
          "data-depth": attributes.depth as number,
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-profile-item]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-profile-item": "" }, 0];
  },
  addInputRules() {
    return [
      textblockTypeInputRule({
        find: /^\s*[-*+]\s$/,
        type: this.type,
        getAttributes: { depth: 0 },
      }),
    ];
  },
});

/** One line of a quote: `> …`. */
export const ProfileQuote = Node.create({
  name: "profileQuote",
  group: "block",
  content: "text*",
  defining: true,
  parseHTML() {
    return [{ tag: "div[data-profile-quote]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-profile-quote": "" }, 0];
  },
  addInputRules() {
    return [textblockTypeInputRule({ find: /^>\s$/, type: this.type })];
  },
});

/** The depth of the block before the cursor's, or -1 when it isn't an item. */
function previousDepth(editor: Editor) {
  const { $from } = editor.state.selection;
  const index = $from.index(0);
  if (index === 0) return -1;
  const previous = editor.state.doc.child(index - 1);
  return previous.type.name === "profileItem"
    ? (previous.attrs.depth as number)
    : -1;
}

function setDepth(editor: Editor, depth: number) {
  return editor.commands.updateAttributes("profileItem", { depth });
}

/**
 * The Notion-like keys of the flat blocks: Enter continues an item or a
 * quote (an empty one steps out), Tab and Shift-Tab indent, Backspace at
 * the start of an item or quote steps out before deleting.
 */
export const ProfileKeys = Extension.create({
  name: "profileKeys",
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        const node = $from.parent;
        if (
          !empty ||
          !["profileItem", "profileQuote"].includes(node.type.name)
        ) {
          return false;
        }
        if (!node.textContent) {
          const depth = node.attrs.depth as number | undefined;
          if (depth) return setDepth(editor, depth - 1);
          return editor.commands.setNode("paragraph");
        }
        return editor.commands.command(({ tr, dispatch }) => {
          if (dispatch) {
            tr.split($from.pos, 1, [{ type: node.type, attrs: node.attrs }]);
            tr.scrollIntoView();
          }
          return true;
        });
      },
      Tab: ({ editor }) => {
        const node = editor.state.selection.$from.parent;
        if (node.type.name !== "profileItem") return true;
        const depth = node.attrs.depth as number;
        const limit = Math.min(previousDepth(editor) + 1, maxDepth);
        return depth < limit ? setDepth(editor, depth + 1) : true;
      },
      "Shift-Tab": ({ editor }) => {
        const node = editor.state.selection.$from.parent;
        if (node.type.name !== "profileItem") return true;
        const depth = node.attrs.depth as number;
        return depth > 0 ? setDepth(editor, depth - 1) : true;
      },
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        const node = $from.parent;
        if (!empty || $from.parentOffset !== 0) return false;
        if (node.type.name === "profileItem") {
          const depth = node.attrs.depth as number;
          if (depth) return setDepth(editor, depth - 1);
          return editor.commands.setNode("paragraph");
        }
        if (node.type.name === "profileQuote" || node.type.name === "heading") {
          return editor.commands.setNode("paragraph");
        }
        return false;
      },
    };
  },
});

/**
 * Pasted text is read as the profile's Markdown (a resume excerpt, another
 * profile), and copied text is written as Markdown lines.
 */
export const ProfileClipboard = Extension.create({
  name: "profileClipboard",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("profileClipboard"),
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData("text/plain") ?? "";
            if (!text.includes("\n")) return false;
            const blocks = parseBlocks(text);
            if (!blocks.length) return false;
            const doc = editor.schema.nodeFromJSON(blocksToDoc(blocks));
            // Open on both ends: the first and last lines merge with the
            // block the cursor is in, the ones between become blocks.
            view.dispatch(
              view.state.tr
                .replaceSelection(new Slice(doc.content, 1, 1))
                .scrollIntoView()
            );
            return true;
          },
          clipboardTextSerializer: (slice) => {
            const doc = editor.schema.topNodeType.create(null, slice.content);
            return serializeBlocks(docToBlocks(doc)).trimEnd();
          },
        },
      }),
    ];
  },
});

/** Transactions the app makes on purpose carry this meta to pass the lock. */
export const allowStructure = "allowStructure";

/**
 * The document's title, its opening note and the template's sections are
 * fixed: a typed, deleted or dragged change to them is rejected, unless the
 * app made it on purpose (paste, undo, fixes, inserts, restores). The title
 * and the note can't take the cursor at all.
 */
export const ProfileLockedHeadings = Extension.create({
  name: "profileLockedHeadings",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("profileLockedHeadings"),
        filterTransaction: (tr, state) => {
          if (!tr.docChanged) return true;
          if (
            tr.getMeta(allowStructure) ||
            tr.getMeta("uiEvent") === "paste" ||
            tr.getMeta("history$")
          ) {
            return true;
          }
          const before = introNote(state.doc);
          const after = introNote(tr.doc);
          return (
            sameLockedHeadings(state.doc, tr.doc) &&
            before.length === after.length &&
            before.every((line, index) => line === after[index])
          );
        },
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            for (const offset of lockedNodeOffsets(state.doc)) {
              const node = state.doc.nodeAt(offset)!;
              const title =
                node.type.name === "heading" && node.attrs.level === 1;
              decorations.push(
                Decoration.node(offset, offset + node.nodeSize, {
                  class: "profile-locked-heading",
                  ...(title ? { contenteditable: "false" } : {}),
                })
              );
            }
            for (const offset of introNoteOffsets(state.doc)) {
              const node = state.doc.nodeAt(offset)!;
              decorations.push(
                Decoration.node(offset, offset + node.nodeSize, {
                  class: "profile-locked-heading",
                  contenteditable: "false",
                })
              );
            }
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

/**
 * The profile's figure marks (profile-truth spec): `[medido]` / `[measured]`,
 * `[estimado]` / `[estimated]` and `[sem número]` / `[no number]`, an
 * optional source after a colon.
 */
const markPattern =
  /\[(medido|measured|estimado|estimated|sem número|no number)(?::[^\]]*)?\]/giu;

const markTone: Record<string, string> = {
  medido: "bg-fit-high-soft text-fit-high",
  measured: "bg-fit-high-soft text-fit-high",
  estimado: "bg-fit-mid-soft text-fit-mid",
  estimated: "bg-fit-mid-soft text-fit-mid",
  "sem número": "bg-secondary text-status-analyzed",
  "no number": "bg-secondary text-status-analyzed",
};

/**
 * Sets the figure marks apart in mono, tinted by how sure the figure is
 * (ADR 0012); the stored text stays plain.
 */
export const ProfileMarks = Extension.create({
  name: "profileMarks",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("profileMarks"),
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isTextblock) return true;
              for (const match of node.textContent.matchAll(markPattern)) {
                const kind = (match[1] ?? "").toLowerCase();
                decorations.push(
                  Decoration.inline(
                    pos + 1 + match.index,
                    pos + 1 + match.index + match[0].length,
                    {
                      class: cn(
                        "rounded-sm px-1 font-mono text-[0.82em] box-decoration-clone",
                        markTone[kind]
                      ),
                    }
                  )
                );
              }
              return false;
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

/** The link the cursor is in (no selection), with its document range. */
export function linkAtCursor(state: EditorState) {
  const { selection } = state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if (!$from.parent.isTextblock || isLockedNode($from.parent)) return null;
  const offset = $from.parentOffset;
  const link = findLinks($from.parent.textContent).find(
    (candidate) => offset >= candidate.from && offset <= candidate.to
  );
  if (!link) return null;
  const start = $from.start();
  return { href: link.href, from: start + link.from, to: start + link.to };
}

/**
 * Underlines the links in the text (URLs, e-mails) as decorations: the
 * stored text stays plain. Ctrl/Cmd+click opens one in a new tab; a plain
 * click still places the cursor.
 */
export const ProfileLinks = Extension.create({
  name: "profileLinks",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("profileLinks"),
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isTextblock) return true;
              if (isLockedNode(node)) return false;
              for (const link of findLinks(node.textContent)) {
                decorations.push(
                  Decoration.inline(pos + 1 + link.from, pos + 1 + link.to, {
                    // Styled like the app's link Button (shadcn).
                    class: cn("text-primary underline underline-offset-4"),
                    "data-href": link.href,
                  })
                );
              }
              return false;
            });
            return DecorationSet.create(state.doc, decorations);
          },
          handleClick: (_view, _pos, event) => {
            if (!(event.metaKey || event.ctrlKey)) return false;
            const href = (
              event.target as HTMLElement | null
            )?.closest<HTMLElement>("[data-href]")?.dataset.href;
            if (!href) return false;
            window.open(href, "_blank", "noopener,noreferrer");
            return true;
          },
        },
      }),
    ];
  },
});

export type EditorDecorationSpec =
  | {
      kind: "inline";
      from: number;
      to: number;
      className: string;
      // Identifies the finding a hover card describes.
      finding?: string;
      key: string;
    }
  // A whole block (a line a suggestion would replace, an entry a finding
  // is about).
  | {
      kind: "node";
      from: number;
      to: number;
      className: string;
      finding?: string;
      key: string;
    }
  | {
      kind: "widget";
      at: number;
      element: () => HTMLElement;
      key: string;
      // Has buttons of its own: the editor leaves its events alone.
      interactive?: boolean;
    };

export const decorationsKey = new PluginKey<DecorationSet>(
  "profileDecorations"
);

/**
 * Holds the decorations the editor draws over the text (linter findings,
 * hints): the page computes them and hands them over with
 * `setDecorations`, and edits move them along until the next set.
 */
export const ProfileDecorations = Extension.create({
  name: "profileDecorations",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: decorationsKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const next = tr.getMeta(decorationsKey) as
              DecorationSet | undefined;
            return next ?? set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => decorationsKey.getState(state),
        },
      }),
    ];
  },
});

export function setDecorations(editor: Editor, specs: EditorDecorationSpec[]) {
  const { doc } = editor.state;
  const decorations = specs.flatMap((spec) => {
    if (spec.kind === "widget") {
      if (spec.at < 0 || spec.at > doc.content.size) return [];
      return [
        Decoration.widget(spec.at, spec.element, {
          key: spec.key,
          side: 1,
          ...(spec.interactive
            ? { stopEvent: () => true, ignoreSelection: true }
            : {}),
        }),
      ];
    }
    if (spec.kind === "node") {
      if (spec.from >= spec.to || spec.to > doc.content.size) return [];
      return [
        Decoration.node(
          spec.from,
          spec.to,
          spec.finding
            ? { class: spec.className, "data-finding": spec.finding }
            : { class: spec.className },
          { key: spec.key }
        ),
      ];
    }
    if (spec.from >= spec.to || spec.to > doc.content.size) return [];
    const attrs = spec.finding
      ? { class: spec.className, "data-finding": spec.finding }
      : { class: spec.className };
    return [Decoration.inline(spec.from, spec.to, attrs, { key: spec.key })];
  });
  editor.view.dispatch(
    editor.state.tr
      .setMeta(decorationsKey, DecorationSet.create(doc, decorations))
      .setMeta("addToHistory", false)
  );
}

export function profileExtensions() {
  return [
    StarterKit.configure({
      blockquote: false,
      bold: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      hardBreak: false,
      horizontalRule: false,
      italic: false,
      link: false,
      listItem: false,
      listKeymap: false,
      orderedList: false,
      strike: false,
      trailingNode: false,
      underline: false,
      heading: { levels: [1, 2, 3] },
    }),
    ProfileItem,
    ProfileQuote,
    ProfileKeys,
    ProfileClipboard,
    ProfileLockedHeadings,
    ProfileDecorations,
    ProfileLinks,
    ProfileMarks,
  ];
}

/** Places the cursor at the end of a top-level node and scrolls to it. */
export function focusNodeEnd(editor: Editor, nodeStart: number) {
  const node = editor.state.doc.nodeAt(nodeStart);
  if (!node) return;
  const end = nodeStart + node.nodeSize - 1;
  editor.view.dispatch(
    editor.state.tr
      .setSelection(TextSelection.create(editor.state.doc, end))
      .scrollIntoView()
  );
  editor.view.focus();
}

/**
 * Room the editor keeps around what it scrolls to: the sticky toolbar
 * covers the top of the scroll area, so a line scrolled to never hides
 * under it.
 */
export const editorScrollMargins = {
  scrollMargin: { top: 128, bottom: 48, left: 0, right: 0 },
  scrollThreshold: { top: 128, bottom: 48, left: 0, right: 0 },
};
