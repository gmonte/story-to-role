"use client";

import type { ReactNode } from "react";

import { Check, Circle, Sparkles } from "lucide-react";

import { cn } from "@repo/web/lib/utils";

export type AiStep = { key: string; label: string };

/**
 * The AI at work, the same everywhere: what it's doing now in words that
 * shimmer, the steps it has done and has left, and what it found so far.
 * Never a still "Loading…" label.
 */
export function AiAtWork({
  title,
  steps,
  current,
  detail,
  note,
  className,
}: {
  title: string;
  steps?: AiStep[];
  // The key of the step under way, or "done".
  current?: string;
  // What it found so far ("6 positions, 40 facts").
  detail?: ReactNode;
  // A reassurance below (for example, that the page can be left).
  note?: ReactNode;
  className?: string;
}) {
  // "done" (or any key past the list) marks every step as finished.
  const found = steps?.findIndex((step) => step.key === current) ?? -1;
  const index = current === "done" ? (steps?.length ?? 0) : found;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "bg-muted/40 flex flex-col gap-3 rounded-lg border p-4",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Sparkles className="text-brand-accent size-4 shrink-0 motion-safe:animate-pulse" />
        {/* One line: a long file name is cut, and shown whole on hover. */}
        <span
          title={title}
          className="from-foreground via-muted-foreground to-foreground motion-safe:animate-shimmer min-w-0 truncate bg-linear-to-r bg-[length:200%_100%] bg-clip-text text-sm font-medium text-transparent"
        >
          {title}
        </span>
      </div>
      {steps && steps.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {steps.map((step, position) => {
            const done = index > position;
            const active = index === position;
            return (
              <li
                key={step.key}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 text-xs transition-colors",
                  done && "text-muted-foreground",
                  active && "text-foreground font-medium",
                  !done && !active && "text-muted-foreground/60"
                )}
              >
                {done ? (
                  <Check className="text-success size-3.5" />
                ) : active ? (
                  <Sparkles className="text-brand-accent size-3.5 motion-safe:animate-spin motion-safe:[animation-duration:3s]" />
                ) : (
                  <Circle className="size-3.5" />
                )}
                {step.label}
              </li>
            );
          })}
        </ol>
      )}
      {detail && <p className="text-sm">{detail}</p>}
      {note && <p className="text-muted-foreground text-xs">{note}</p>}
    </div>
  );
}
