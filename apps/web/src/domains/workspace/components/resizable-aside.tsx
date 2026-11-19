"use client";

import {
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { GripVertical } from "lucide-react";

import { cn } from "@repo/web/lib/utils";

const minWidth = 240;
const maxWidth = 640;

/**
 * A left column the user widens or narrows by dragging its edge (the
 * index of My career and the documents), remembered per viewer under
 * `storageKey`: read from storage on the client, so the server renders
 * the default and both agree.
 */
export function ResizableAside({
  storageKey,
  defaultWidth = 360,
  className,
  children,
}: {
  storageKey: string;
  defaultWidth?: number;
  className?: string;
  children: ReactNode;
}) {
  const saved = useSyncExternalStore(
    () => () => undefined,
    () => {
      try {
        const stored = Number(window.localStorage.getItem(storageKey));
        return stored >= minWidth && stored <= maxWidth ? stored : defaultWidth;
      } catch {
        return defaultWidth;
      }
    },
    () => defaultWidth
  );
  const [dragged, setDragged] = useState<number | null>(null);
  const width = dragged ?? saved;

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    let latest = width;
    const onMove = (move: PointerEvent) => {
      latest = Math.min(
        maxWidth,
        Math.max(minWidth, width + move.clientX - startX)
      );
      setDragged(latest);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      try {
        window.localStorage.setItem(storageKey, String(Math.round(latest)));
      } catch {
        // Not remembered this time.
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <>
      <aside
        className={cn("hidden shrink-0 overflow-y-auto md:block", className)}
        style={{ width }}
      >
        {children}
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={startResize}
        className="hover:bg-primary/20 hidden w-1.5 shrink-0 cursor-col-resize touch-none items-center justify-center border-l md:flex"
      >
        <GripVertical className="text-muted-foreground size-3" />
      </div>
    </>
  );
}
