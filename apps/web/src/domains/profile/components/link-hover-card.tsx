"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Editor } from "@tiptap/core";
import { ExternalLink } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

const openDelayMs = 300;
const closeDelayMs = 150;

/**
 * The small card over a link in the text: its address and a button to open
 * it in a new tab. A link under a finding shows the finding's card instead.
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
          left: rect.left,
          top: rect.bottom + 4,
        });
      }, openDelayMs);
    };
    const out = (event: MouseEvent) => {
      if (!target(event)) return;
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => setCard(null), closeDelayMs);
    };
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
      document.removeEventListener("scroll", close, true);
    };
  }, [editor, close]);

  if (!card) return null;
  return (
    <div
      role="tooltip"
      className="bg-popover text-popover-foreground fixed z-50 max-w-xs space-y-1.5 rounded-md border p-2.5 text-xs shadow-md"
      style={{
        left: Math.max(8, Math.min(card.left, window.innerWidth - 328)),
        top: card.top,
      }}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => clearTimeout(closeTimer.current)}
      onMouseLeave={() => {
        closeTimer.current = setTimeout(() => setCard(null), closeDelayMs);
      }}
    >
      <p className="break-all">{card.href.replace(/^mailto:/, "")}</p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          onClick={() => {
            window.open(card.href, "_blank", "noopener,noreferrer");
            close();
          }}
        >
          <ExternalLink className="size-3" />
          {t.formatMessage({ defaultMessage: "Open in a new tab" })}
        </Button>
        <span className="text-muted-foreground">
          {t.formatMessage({ defaultMessage: "Ctrl/⌘ + click" })}
        </span>
      </div>
    </div>
  );
}
