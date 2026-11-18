"use client";

import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { GripVertical } from "lucide-react";

// The preview's width while it's open, in pixels: never so narrow it can't be
// read, never so wide the chat can't be.
const minPreview = 320;
const minChat = 352;
const defaultPreview = 560;
// The side panel's width: a chat needs room, a list less.
const minPanel = 288;
const defaultPanel = { flush: 448, padded: 352 };

// The split is a per-viewer convenience: storage may be missing or blocked.
function readWidth(key: string, fallback: number) {
  try {
    const stored = Number(window.localStorage.getItem(key));
    return Number.isFinite(stored) && stored > 0 ? stored : fallback;
  } catch {
    return fallback;
  }
}

function saveWidth(key: string, width: number) {
  try {
    window.localStorage.setItem(key, String(Math.round(width)));
  } catch {
    // Not remembered this time.
  }
}

/**
 * The chat, the side panel and, when a file is open, its preview. The
 * divider before the side panel resizes the panel; the one before the
 * preview resizes the preview; the chat takes the rest. Both widths are
 * remembered per screen. The chat is always the first child, so opening or closing a preview
 * never remounts it (its draft and scroll stay).
 */
export function WorkspaceBody({
  layoutId,
  chat,
  panel,
  flushPanel = false,
  preview,
  previewOpen = false,
}: {
  // Remembers the split per screen.
  layoutId: string;
  chat: ReactNode;
  panel?: ReactNode;
  // A wider panel with no padding, which scrolls inside itself (a chat).
  flushPanel?: boolean;
  preview?: ReactNode;
  previewOpen?: boolean;
}) {
  const storageKey = `workspace-preview-width:${layoutId}`;
  const panelKey = `workspace-panel-width:${layoutId}`;
  const panelFallback = flushPanel ? defaultPanel.flush : defaultPanel.padded;
  const container = useRef<HTMLDivElement>(null);
  // Read once on the client; the server never renders an open preview.
  const [width, setWidth] = useState(() =>
    typeof window === "undefined"
      ? defaultPreview
      : readWidth(storageKey, defaultPreview)
  );
  const [panelWidth, setPanelWidth] = useState(() =>
    typeof window === "undefined"
      ? panelFallback
      : readWidth(panelKey, panelFallback)
  );

  /** Drags a divider: leftwards widens the column on its right. */
  function startDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    column: "panel" | "preview"
  ) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = column === "panel" ? panelWidth : width;
    const total = container.current?.clientWidth ?? 0;
    const others =
      column === "panel" ? (previewOpen ? width : 0) : panel ? panelWidth : 0;
    const min = column === "panel" ? minPanel : minPreview;
    let next = startWidth;

    const onMove = (move: PointerEvent) => {
      next = Math.min(
        Math.max(startWidth + startX - move.clientX, min),
        Math.max(total - others - minChat, min)
      );
      if (column === "panel") setPanelWidth(next);
      else setWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      saveWidth(column === "panel" ? panelKey : storageKey, next);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div ref={container} className="flex min-h-0 flex-1">
      <main className="flex min-w-0 flex-1 flex-col">{chat}</main>
      {panel && (
        <Divider onPointerDown={(event) => startDrag(event, "panel")} />
      )}
      {panel && (
        // A panel that renders nothing (My career before the privacy notice)
        // leaves no empty column behind.
        <aside
          style={{ width: panelWidth }}
          className={
            flushPanel
              ? "bg-muted/30 hidden max-w-[50vw] shrink-0 overflow-hidden empty:hidden lg:block"
              : "bg-muted/30 hidden max-w-[50vw] shrink-0 overflow-y-auto p-4 empty:hidden lg:block"
          }
        >
          {panel}
        </aside>
      )}
      {previewOpen && (
        <Divider onPointerDown={(event) => startDrag(event, "preview")} />
      )}
      {previewOpen && (
        <aside
          style={{ width }}
          className="bg-background hidden max-w-[60vw] shrink-0 border-l empty:hidden lg:block"
        >
          {preview}
        </aside>
      )}
    </div>
  );
}

function Divider({
  onPointerDown,
}: {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      className="hover:bg-primary/20 hidden w-1.5 shrink-0 cursor-col-resize touch-none items-center justify-center border-l lg:flex"
    >
      <GripVertical className="text-muted-foreground size-3" />
    </div>
  );
}
