import {
  Extension,
  Node,
  textblockTypeInputRule,
  type Editor,
} from "@tiptap/core";
import { Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";

import {
  parseBlocks,
  serializeBlocks,
} from "@repo/api/domains/profile/truth/blocks";

import { blocksToDoc, docToBlocks } from "./editor-doc";

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

export type EditorDecorationSpec =
  | {
      kind: "inline";
      from: number;
      to: number;
      className: string;
      title?: string;
      key: string;
    }
  // A whole block (a line a suggestion would replace).
  | { kind: "node"; from: number; to: number; className: string; key: string }
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
              | DecorationSet
              | undefined;
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
          { class: spec.className },
          { key: spec.key }
        ),
      ];
    }
    if (spec.from >= spec.to || spec.to > doc.content.size) return [];
    const attrs = spec.title
      ? { class: spec.className, title: spec.title }
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
    ProfileDecorations,
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
