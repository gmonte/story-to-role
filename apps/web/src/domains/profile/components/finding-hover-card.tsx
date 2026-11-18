"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { Editor } from "@tiptap/core";
import { EyeOff, Sparkles, Wand2 } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import type { ProfileFinding } from "@repo/api/domains/profile/truth/lint";
import { Button } from "@repo/web/components/ui/button";

import { floatingCardStyle } from "~/tools/floating-card";

import { FindingQuickActions } from "./finding-quick-actions";

export type FindingCardInfo = {
  message: string;
  /** The linter's finding, for its quick actions; absent on review notes. */
  finding?: ProfileFinding;
  /** Applies the fix; absent when the finding isn't fixable. */
  fix?: () => void;
  /** Ignores the finding; absent for format findings, which can't be. */
  ignore?: () => void;
  /** Starts a talk with the agent; absent where there is no agent. */
  talk?: () => void;
  /** What else the finding offers (a document's "Add to the profile"). */
  extra?: ReactNode;
};

const openDelayMs = 150;
const closeDelayMs = 120;

/**
 * The card over an underlined finding, like an editor's problem hover: it
 * opens shortly after the pointer rests on the text, stays while the pointer
 * moves into it, and closes on leaving, Escape or typing. It never takes
 * focus, so the editor's selection stays where it was.
 */
export function FindingHoverCard({
  editor,
  describe,
}: {
  editor: Editor | null;
  /** The finding behind a `data-finding` key, if it still exists. */
  describe: (key: string) => FindingCardInfo | null;
}) {
  const t = useTranslation();
  const [card, setCard] = useState<{ key: string; anchor: DOMRect } | null>(
    null
  );
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const describeRef = useRef(describe);
  useEffect(() => {
    describeRef.current = describe;
  });

  const close = useCallback(() => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    setCard(null);
  }, []);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const target = (event: Event) =>
      (event.target as HTMLElement | null)?.closest<HTMLElement>(
        "[data-finding]"
      ) ?? null;
    const over = (event: MouseEvent) => {
      const element = target(event);
      if (!element) return;
      clearTimeout(closeTimer.current);
      const key = element.dataset.finding!;
      clearTimeout(openTimer.current);
      openTimer.current = setTimeout(() => {
        setCard({ key, anchor: element.getBoundingClientRect() });
      }, openDelayMs);
    };
    const out = (event: MouseEvent) => {
      if (!target(event)) return;
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => setCard(null), closeDelayMs);
    };
    const keys = () => close();
    dom.addEventListener("mouseover", over);
    dom.addEventListener("mouseout", out);
    dom.addEventListener("keydown", keys);
    editor.on("update", close);
    document.addEventListener("scroll", close, true);
    return () => {
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
      dom.removeEventListener("mouseover", over);
      dom.removeEventListener("mouseout", out);
      dom.removeEventListener("keydown", keys);
      editor.off("update", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [editor, close]);

  useEffect(() => {
    if (!card) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [card, close]);

  const info = card ? describe(card.key) : null;
  if (!card || !info) return null;
  return (
    <div
      role="tooltip"
      // Kept inside the viewport: capped to the room it has, scrolling,
      // above the text when there is more room there.
      className="bg-popover text-popover-foreground fixed z-50 max-w-xs space-y-2 overflow-y-auto rounded-md border p-2.5 text-xs shadow-md"
      style={floatingCardStyle(card.anchor, 320)}
      // Pressing inside never moves the editor's selection or focus.
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => clearTimeout(closeTimer.current)}
      onMouseLeave={() => {
        closeTimer.current = setTimeout(() => setCard(null), closeDelayMs);
      }}
    >
      <p>{info.message}</p>
      {(info.fix ?? info.talk ?? info.finding ?? info.ignore ?? info.extra) && (
        <div className="flex flex-wrap items-center gap-1">
          {info.extra}
          {info.finding && (
            <FindingQuickActions
              finding={info.finding}
              onApplied={close}
              goTo={false}
            />
          )}
          {info.fix && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={() => {
                info.fix?.();
                close();
              }}
            >
              <Wand2 className="size-3" />
              {t.formatMessage({ defaultMessage: "Fix" })}
            </Button>
          )}
          {info.talk && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => {
                info.talk?.();
                close();
              }}
            >
              <Sparkles className="size-3" />
              {t.formatMessage({ defaultMessage: "Talk to the agent" })}
            </Button>
          )}
          {info.ignore && (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground h-6 px-2 text-xs"
              onClick={() => {
                info.ignore?.();
                close();
              }}
            >
              <EyeOff className="size-3" />
              {t.formatMessage({ defaultMessage: "Ignore" })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
