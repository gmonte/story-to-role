"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Editor } from "@tiptap/core";
import { ExternalLink } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { linkAtCursor } from "../utils/editor-extensions";

const openDelayMs = 300;
const closeDelayMs = 150;

/**
 * A small button at the top right of a link in the text that opens it in a
 * new tab (Ctrl/⌘ + click does too). A link under a finding shows the
 * finding's card instead.
 */
export function LinkHoverCard({ editor }: { editor: Editor | null }) {
  const t = useTranslation();
  const [card, setCard] = useState<{
    href: string;
    left: number;
    top: number;
  } | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const close = useCallback(() => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    setCard(null);
  }, []);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const target = (event: Event) => {
      const element = event.target as HTMLElement | null;
      if (element?.closest("[data-finding]")) return null;
      return element?.closest<HTMLElement>("[data-href]") ?? null;
    };
    const over = (event: MouseEvent) => {
      const element = target(event);
      if (!element) return;
      clearTimeout(closeTimer.current);
      clearTimeout(openTimer.current);
      openTimer.current = setTimeout(() => {
        const rect = element.getBoundingClientRect();
        setCard({
          href: element.dataset.href!,
          left: rect.right,
          top: rect.top,
        });
      }, openDelayMs);
    };
    const out = (event: MouseEvent) => {
      if (!target(event)) return;
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => setCard(null), closeDelayMs);
    };
    // The cursor in a link shows the button too; leaving it hides it.
    const cursor = () => {
      const link = linkAtCursor(editor.state);
      if (!link) return;
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
      const start = editor.view.coordsAtPos(link.from);
      const end = editor.view.coordsAtPos(link.to);
      setCard({ href: link.href, left: end.right, top: start.top });
    };
    const selectionChanged = () => {
      if (linkAtCursor(editor.state)) cursor();
      else setCard(null);
    };
    editor.on("selectionUpdate", selectionChanged);
    dom.addEventListener("mouseover", over);
    dom.addEventListener("mouseout", out);
    dom.addEventListener("keydown", close);
    editor.on("update", close);
    document.addEventListener("scroll", close, true);
    return () => {
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
      dom.removeEventListener("mouseover", over);
      dom.removeEventListener("mouseout", out);
      dom.removeEventListener("keydown", close);
      editor.off("update", close);
      editor.off("selectionUpdate", selectionChanged);
      document.removeEventListener("scroll", close, true);
    };
  }, [editor, close]);

  if (!card) return null;
  const label = t.formatMessage({ defaultMessage: "Open in a new tab" });
  return (
    <Button
      size="icon"
      className="fixed z-50 size-6 -translate-y-full shadow-sm"
      style={{
        left: Math.min(card.left, window.innerWidth - 32),
        top: card.top,
      }}
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => clearTimeout(closeTimer.current)}
      onMouseLeave={() => {
        closeTimer.current = setTimeout(() => setCard(null), closeDelayMs);
      }}
      onClick={() => {
        window.open(card.href, "_blank", "noopener,noreferrer");
        close();
      }}
    >
      <ExternalLink className="size-3" />
    </Button>
  );
}
