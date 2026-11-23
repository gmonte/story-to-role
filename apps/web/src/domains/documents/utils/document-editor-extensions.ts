import { Extension, Node, type Editor, type JSONContent } from "@tiptap/core";
import type { DOMOutputSpec, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";

import { cn } from "@repo/web/lib/utils";

import {
  allowStructure,
  ProfileDecorations,
} from "~/domains/profile/utils/editor-extensions";

import { clipboardText } from "./clipboard-text";
import {
  type DocumentBlock,
  isEditableBlock,
  isListBlock,
  isRemovableBlock,
  newLineId,
} from "./document-blocks";

export const blockNodeName = "documentBlock";

type BlockAttrs = {
  type: DocumentBlock["type"];
  locked: boolean;
  lineId: string | null;
  ownerId: string | null;
  label: string | null;
  kind: string | null;
  credentialId: string | null;
};

const emptyAttrs: BlockAttrs = {
  type: "bullet",
  locked: false,
  lineId: null,
  ownerId: null,
  label: null,
  kind: null,
  credentialId: null,
};

/** The editor's node for a block, with the block's fields as attributes. */
export function blockToNode(block: DocumentBlock): JSONContent {
  const { text } = block;
  const attrs: BlockAttrs = {
    ...emptyAttrs,
    type: block.type,
    locked: !isEditableBlock(block),
    lineId: "lineId" in block ? block.lineId : null,
    ownerId: "ownerId" in block ? block.ownerId : null,
    label: block.type === "skill" ? block.label : null,
    kind: block.type === "sectionTitle" ? block.kind : null,
    credentialId: block.type === "credential" ? block.credentialId : null,
  };
  return {
    type: blockNodeName,
    attrs,
    content: text ? [{ type: "text", text }] : [],
  };
}

export function blocksToDoc(blocks: DocumentBlock[]): JSONContent {
  return { type: "doc", content: blocks.map(blockToNode) };
}

/** The block a node holds; the text is what the user sees in it. */
export function nodeToBlock(node: ProseMirrorNode): DocumentBlock {
  const attrs = node.attrs as BlockAttrs;
  const text = node.textContent;
  switch (attrs.type) {
    case "sectionTitle":
      return {
        type: "sectionTitle",
        kind: attrs.kind as Extract<
          DocumentBlock,
          { type: "sectionTitle" }
        >["kind"],
        text,
      };
    case "summary":
      return { type: "summary", lineId: attrs.lineId ?? "", text };
    case "skill":
      return {
        type: "skill",
        lineId: attrs.lineId ?? "",
        label: attrs.label ?? "",
        text,
      };
    case "entry":
    case "entryPeriod":
    case "entryTitle":
    case "entryLink":
      return {
        type: attrs.type,
        ownerId: attrs.ownerId ?? "",
        text,
        // A LinkedIn text's facts, printed by code.
        ...(attrs.locked ? { locked: true } : {}),
      };
    case "entryContext":
    case "entryNote":
      return { type: attrs.type, ownerId: attrs.ownerId ?? "", text };
    case "headline":
      return { type: "headline", lineId: attrs.lineId ?? "", text };
    case "description":
      return {
        type: "description",
        lineId: attrs.lineId ?? "",
        ownerId: attrs.ownerId ?? "",
        text,
      };
    case "bullet":
      return {
        type: "bullet",
        lineId: attrs.lineId ?? "",
        ownerId: attrs.ownerId ?? "",
        text,
      };
    case "credential":
      return {
        type: "credential",
        credentialId: attrs.credentialId ?? "",
        text,
      };
    case "paragraph":
      return { type: "paragraph", lineId: attrs.lineId ?? "", text };
    case "name":
    case "titleLine":
    case "contacts":
    case "city":
    case "greeting":
    case "closing":
      return { type: attrs.type, text };
  }
}

export function docToBlocks(doc: ProseMirrorNode): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  doc.forEach((node) => {
    if (node.type.name === blockNodeName) blocks.push(nodeToBlock(node));
  });
  return blocks;
}

/** Where each top-level node starts, by block index. */
export function blockPositions(doc: ProseMirrorNode) {
  const positions: number[] = [];
  doc.forEach((node, offset) => {
    if (node.type.name === blockNodeName) positions.push(offset);
  });
  return positions;
}

/** The locked blocks as one string: a change to it is a change to a fact. */
function lockedSignature(doc: ProseMirrorNode) {
  const parts: string[] = [];
  doc.forEach((node) => {
    if (node.type.name !== blockNodeName) {
      parts.push("!");
      return;
    }
    const attrs = node.attrs as BlockAttrs;
    if (attrs.locked) parts.push(JSON.stringify([attrs, node.textContent]));
  });
  return parts.join("\n");
}

const attribute = (name: keyof BlockAttrs) => ({
  default: emptyAttrs[name],
  parseHTML: (element: HTMLElement) => {
    const value = element.getAttribute(`data-${name}`);
    return name === "locked" ? value === "true" : value;
  },
  renderHTML: () => ({}),
});

/**
 * One block of the document in its PDF look (resume spec, "Layout"): the
 * header in the accent color, uppercase section titles over a rule, the
 * employer bold with the period aligned right and the title in italics,
 * bullets with a hanging indent. Only the section titles, the credentials
 * and a very old experience's note are not editable.
 */
export const DocumentBlockNode = Node.create<{
  // "Included for:", before a very old experience's requirement.
  notePrefix: string;
  // What an empty LinkedIn headline or education description invites.
  placeholders: { headline: string; description: string };
}>({
  name: blockNodeName,
  group: "block",
  content: "text*",
  defining: true,
  addOptions() {
    return { notePrefix: "", placeholders: { headline: "", description: "" } };
  },
  addAttributes() {
    return Object.fromEntries(
      (Object.keys(emptyAttrs) as Array<keyof BlockAttrs>).map((name) => [
        name,
        attribute(name),
      ])
    );
  },
  parseHTML() {
    return [{ tag: "div[data-document-block]" }];
  },
  renderHTML({ node }) {
    const attrs = node.attrs as BlockAttrs;
    const base: Record<string, string> = {
      "data-document-block": attrs.type,
      ...(attrs.lineId ? { "data-line-id": attrs.lineId } : {}),
      ...(attrs.ownerId && attrs.type === "entry"
        ? { "data-position-id": attrs.ownerId }
        : {}),
      ...(attrs.locked
        ? { contenteditable: "false", "data-locked": attrs.type }
        : {}),
    };
    // `0` is the hole the block's text goes in.
    const block = (className: string, ...rest: Array<DOMOutputSpec | 0>) =>
      [
        "div",
        { ...base, class: className },
        ...rest,
      ] as unknown as DOMOutputSpec;
    switch (attrs.type) {
      case "name":
        return block(cn("text-doc-accent text-2xl leading-tight font-bold"), 0);
      case "titleLine":
        return block(cn("mt-1 font-semibold"), 0);
      case "contacts":
      case "city":
        return block(cn("text-doc-muted text-xs"), 0);
      case "sectionTitle":
        return block(
          cn(
            "text-doc-accent border-doc-rule mt-5 mb-1.5 border-b pb-0.5 text-xs font-bold tracking-wide uppercase"
          ),
          0
        );
      case "summary":
        return block(cn("text-justify"), 0);
      // The label runs inline with the text, as the PDF prints it, so a
      // wrapped line starts at the left margin rather than under the text.
      case "skill":
        return block(
          cn("text-justify"),
          [
            "span",
            { class: cn("font-semibold"), contenteditable: "false" },
            `${attrs.label ?? ""}: `,
          ],
          ["span", {}, 0] as unknown as DOMOutputSpec
        );
      // The period floats right of the employer's line: it comes first
      // in the document, so the employer's block flows beside it.
      case "entryPeriod":
        return block(
          cn("text-doc-muted float-right mt-2.5 ml-2 pt-0.5 text-xs"),
          0
        );
      case "entry":
        return block(cn("mt-2.5 font-bold"), 0);
      case "entryTitle":
        return block(cn("italic"), 0);
      case "entryContext":
        return block(cn("text-doc-muted text-xs italic"), 0);
      case "entryLink":
        return block(cn("text-doc-muted text-xs italic"), 0);
      case "entryNote":
        return block(
          cn("text-doc-muted text-xs"),
          ["span", { contenteditable: "false" }, `${this.options.notePrefix} `],
          ["span", {}, 0] as unknown as DOMOutputSpec
        );
      case "bullet":
        return block(
          cn(
            "relative pl-4 before:absolute before:left-1 before:content-['•']"
          ),
          0
        );
      case "credential":
        return block(cn("mt-0.5"), 0);
      // An empty one shows what to write, until the user types.
      case "headline":
      case "description":
        return [
          "div",
          {
            ...base,
            "data-placeholder": this.options.placeholders[attrs.type],
            class: cn(
              attrs.type === "headline"
                ? "font-semibold"
                : "text-doc-muted mb-1 text-xs",
              "has-[br.ProseMirror-trailingBreak:only-child]:before:text-doc-muted/60 has-[br.ProseMirror-trailingBreak:only-child]:before:pointer-events-none has-[br.ProseMirror-trailingBreak:only-child]:before:float-left has-[br.ProseMirror-trailingBreak:only-child]:before:content-[attr(data-placeholder)]"
            ),
          },
          0,
        ] as unknown as DOMOutputSpec;
      case "greeting":
        return block(cn("mt-6"), 0);
      case "paragraph":
        return block(cn("mt-3 text-justify"), 0);
      case "closing":
        return block(cn("mt-4"), 0);
    }
  },
});

/** The node under the cursor when it is a block the user may edit. */
function editableParent(editor: Editor) {
  const { $from } = editor.state.selection;
  const node = $from.parent;
  if (node.type.name !== blockNodeName) return null;
  const attrs = node.attrs as BlockAttrs;
  return attrs.locked ? null : { node, attrs, $from };
}

/**
 * The keys of the flat blocks: Enter splits a bullet or a paragraph into
 * a new one (a single line never splits), Backspace at the start of an
 * empty bullet, paragraph or skill group removes it and never merges two
 * blocks, Delete at the end never pulls the next block in.
 */
export const DocumentKeys = Extension.create({
  name: "documentKeys",
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const parent = editableParent(editor);
        if (!parent) return true;
        const { node, attrs, $from } = parent;
        if (!isListBlock(attrs.type)) return true;
        return editor.commands.command(({ tr, dispatch }) => {
          if (dispatch) {
            tr.split($from.pos, 1, [
              { type: node.type, attrs: { ...attrs, lineId: newLineId() } },
            ]);
            tr.scrollIntoView();
          }
          return true;
        });
      },
      "Shift-Enter": () => true,
      "Mod-Enter": () => true,
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parentOffset !== 0) return false;
        const parent = editableParent(editor);
        if (!parent) return true;
        if (!isRemovableBlock(parent.attrs.type) || parent.node.textContent) {
          return true;
        }
        return editor.commands.command(({ tr, dispatch }) => {
          if (dispatch) {
            const from = $from.before();
            tr.delete(from, $from.after());
            tr.setSelection(Selection.near(tr.doc.resolve(from), -1));
            tr.scrollIntoView();
          }
          return true;
        });
      },
      Delete: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;
        return $from.parentOffset === $from.parent.content.size;
      },
    };
  },
});

/**
 * Pasted text stays plain: several lines pasted in a bullet or a paragraph
 * become one block each; anywhere else they join into the line.
 */
export const DocumentClipboard = Extension.create({
  name: "documentClipboard",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("documentClipboard"),
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData("text/plain") ?? "";
            const parent = editableParent(editor);
            if (!parent) return true;
            const lines = text
              .split(/\r?\n/)
              .map((line) => line.replace(/^\s*[-•*]\s+/, "").trim())
              .filter(Boolean);
            if (!lines.length) return true;
            const { tr } = view.state;
            if (!isListBlock(parent.attrs.type) || lines.length === 1) {
              view.dispatch(tr.insertText(lines.join(" ")).scrollIntoView());
              return true;
            }
            tr.insertText(lines[0]);
            const type = parent.node.type;
            let at = tr.selection.$from.after();
            for (const line of lines.slice(1)) {
              const node = type.create(
                { ...parent.attrs, lineId: newLineId() },
                view.state.schema.text(line)
              );
              tr.insert(at, node);
              at += node.nodeSize;
            }
            tr.setSelection(Selection.near(tr.doc.resolve(at), -1));
            view.dispatch(tr.scrollIntoView());
            return true;
          },
          clipboardTextSerializer: (slice, view) => {
            const blocks: Array<{ bullet: boolean; text: string }> = [];
            slice.content.forEach((node) =>
              blocks.push({
                bullet: (node.attrs as BlockAttrs).type === "bullet",
                text: node.textContent,
              })
            );
            const { $from, $to } = view.state.selection;
            const wholeLine =
              $from.parentOffset === 0 &&
              $to.parentOffset === $to.parent.content.size;
            return clipboardText(
              blocks,
              blocks.length === 1 && slice.openStart > 0 && !wholeLine
            );
          },
        },
      }),
    ];
  },
});

/**
 * The section titles, the credentials and a very old experience's note
 * are locked: a change to them is rejected, unless the app made it on
 * purpose (a reset from the server, a fix, undo).
 */
export const DocumentLocked = Extension.create({
  name: "documentLocked",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("documentLocked"),
        filterTransaction: (tr, state) => {
          if (!tr.docChanged) return true;
          if (tr.getMeta(allowStructure) || tr.getMeta("history$")) {
            return true;
          }
          return lockedSignature(state.doc) === lockedSignature(tr.doc);
        },
      }),
    ];
  },
});

export function documentExtensions(options: {
  notePrefix: string;
  placeholders: { headline: string; description: string };
}) {
  return [
    StarterKit.configure({
      blockquote: false,
      bold: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      dropcursor: false,
      gapcursor: false,
      hardBreak: false,
      heading: false,
      horizontalRule: false,
      italic: false,
      link: false,
      listItem: false,
      listKeymap: false,
      orderedList: false,
      paragraph: false,
      strike: false,
      trailingNode: false,
      underline: false,
    }),
    DocumentBlockNode.configure(options),
    DocumentKeys,
    DocumentClipboard,
    DocumentLocked,
    ProfileDecorations,
  ];
}

/**
 * Replaces the whole document (a new official snapshot from the server),
 * outside the undo history and past the lock.
 */
export function resetDocument(editor: Editor, blocks: DocumentBlock[]) {
  const nodes = (blocksToDoc(blocks).content ?? []).map((json) =>
    editor.schema.nodeFromJSON(json)
  );
  const { doc } = editor.state;
  editor.view.dispatch(
    editor.state.tr
      .replaceWith(0, doc.content.size, nodes)
      .setMeta(allowStructure, true)
      .setMeta("addToHistory", false)
  );
}

/** Writes new text into one block (a fix), as one undo step. */
export function replaceBlockText(editor: Editor, index: number, text: string) {
  const start = blockPositions(editor.state.doc)[index];
  const node = start === undefined ? null : editor.state.doc.nodeAt(start);
  if (!node) return;
  editor.view.dispatch(
    editor.state.tr
      .insertText(text, start + 1, start + 1 + node.content.size)
      .setMeta(allowStructure, true)
  );
}

/** Adds an empty bullet after the last block of a position or project. */
export function appendBullet(editor: Editor, ownerId: string) {
  const { doc, schema } = editor.state;
  let at = -1;
  doc.forEach((node, offset) => {
    const attrs = node.attrs as BlockAttrs;
    if (node.type.name === blockNodeName && attrs.ownerId === ownerId) {
      at = offset + node.nodeSize;
    }
  });
  if (at < 0) return;
  const node = schema.nodes[blockNodeName].create({
    ...emptyAttrs,
    type: "bullet",
    lineId: newLineId(),
    ownerId,
  });
  const tr = editor.state.tr.insert(at, node);
  tr.setSelection(Selection.near(tr.doc.resolve(at + 1)));
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
}

/** Scrolls a block into view without moving the cursor. */
export function scrollToBlock(editor: Editor, index: number) {
  const start = blockPositions(editor.state.doc)[index];
  if (start === undefined) return;
  const dom = editor.view.nodeDOM(start);
  if (dom instanceof HTMLElement) {
    dom.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/**
 * Goes to a block: scrolls it into view and selects its text (the given
 * span of it, or all of it), as the profile editor does for a finding.
 */
export function selectBlock(
  editor: Editor,
  index: number,
  range?: { from: number; to: number }
) {
  const start = blockPositions(editor.state.doc)[index];
  const node = start === undefined ? null : editor.state.doc.nodeAt(start);
  if (start === undefined || !node) return;
  const size = node.content.size;
  const from = start + 1 + Math.min(range?.from ?? 0, size);
  const to = start + 1 + Math.min(range?.to ?? size, size);
  editor
    .chain()
    .setTextSelection({ from, to })
    .focus(undefined, { scrollIntoView: false })
    .run();
  scrollToBlock(editor, index);
}
