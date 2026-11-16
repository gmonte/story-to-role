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

// The split is a per-viewer convenience: storage may be missing or blocked.
function readWidth(key: string) {
  try {
    const stored = Number(window.localStorage.getItem(key));
    return Number.isFinite(stored) && stored > 0 ? stored : defaultPreview;
  } catch {
    return defaultPreview;
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
 * The chat, the side panel and, when a file is open, its preview. With a
 * preview open, the dividers on both sides of the side panel can be dragged:
 * the side panel keeps its width, the preview grows or shrinks and the chat
 * takes the rest. The chat is always the first child, so opening or closing a preview
 * never remounts it (its draft and scroll stay).
 */
export function WorkspaceBody({
  layoutId,
  chat,
  panel,
  preview,
  previewOpen = false,
}: {
  // Remembers the split per screen.
  layoutId: string;
  chat: ReactNode;
  panel?: ReactNode;
  preview?: ReactNode;
  previewOpen?: boolean;
}) {
  const storageKey = `workspace-preview-width:${layoutId}`;
  const container = useRef<HTMLDivElement>(null);
  const side = useRef<HTMLElement>(null);
  // Read once on the client; the server never renders an open preview.
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? defaultPreview : readWidth(storageKey)
  );

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const total = container.current?.clientWidth ?? 0;
    const panelWidth = side.current?.offsetWidth ?? 0;
    let next = startWidth;

    const onMove = (move: PointerEvent) => {
      // Dragging left widens the preview.
      next = Math.min(
        Math.max(startWidth + startX - move.clientX, minPreview),
        Math.max(total - panelWidth - minChat, minPreview)
      );
      setWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      saveWidth(storageKey, next);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div ref={container} className="flex min-h-0 flex-1">
      <main className="flex min-w-0 flex-1 flex-col">{chat}</main>
      {previewOpen && <Divider onPointerDown={startDrag} />}
      {panel && (
        // A panel that renders nothing (My career before the privacy notice)
        // leaves no empty column behind.
        <aside
          ref={side}
          className="bg-muted/30 hidden w-80 shrink-0 overflow-y-auto border-l p-4 empty:hidden lg:block xl:w-96"
        >
          {panel}
        </aside>
      )}
      {previewOpen && <Divider onPointerDown={startDrag} />}
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
