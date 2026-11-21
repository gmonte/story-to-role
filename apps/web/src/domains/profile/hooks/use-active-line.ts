"use client";

import { useEffect, useState } from "react";

import type { Editor } from "@tiptap/react";

import { blockPositions } from "../utils/editor-doc";

/** The scrolling ancestor of an element (the editor's column). */
function scrollParent(element: HTMLElement) {
  let node = element.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Which of the given lines is in view: the last one whose block has
 * scrolled to the top of the editor's column (the index follows reading).
 */
export function useActiveLine(editor: Editor | null, lines: number[]) {
  const [active, setActive] = useState<number | null>(lines[0] ?? null);
  const key = lines.join(",");

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const root = editor.view.dom;
    const scroller = scrollParent(root);
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (editor.isDestroyed) return;
      const positions = blockPositions(editor.state.doc);
      // A quarter down the column: past the sticky toolbar, where reading is.
      const box = scroller.getBoundingClientRect();
      const top = box.top + box.height / 4;
      let current = lines[0] ?? null;
      for (const line of lines) {
        const start = positions[line];
        if (start === undefined) continue;
        const node = editor.view.nodeDOM(start);
        if (!(node instanceof HTMLElement)) continue;
        if (node.getBoundingClientRect().top <= top) current = line;
        else break;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener("scroll", schedule, { passive: true });
    editor.on("update", schedule);
    return () => {
      scroller.removeEventListener("scroll", schedule);
      editor.off("update", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
    // `key` stands for `lines`, which is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, key]);

  return active;
}
