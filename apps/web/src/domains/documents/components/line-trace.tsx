"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { Editor } from "@tiptap/core";

import type { LineOrigin } from "@repo/api/domains/documents/schemas/document";
import type {
  EvidenceTrace,
  VersionView,
} from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/web/components/ui/tooltip";
import { cn } from "@repo/web/lib/utils";

import { originTone } from "./editing";

/**
 * A passage of the profile a line rests on (resume spec, "Trace in the
 * editor"): its text, and the position it belongs to when it has one.
 */
export function ProfilePassage({ passage }: { passage: EvidenceTrace }) {
  const t = useTranslation();
  return (
    <div className="flex flex-col gap-0.5">
      <span>
        {t.formatMessage(
          { defaultMessage: "“{quote}”" },
          { quote: passage.text }
        )}
      </span>
      <span className="opacity-70">
        {passage.source
          ? t.formatMessage(
              { defaultMessage: "From your profile · {title}, {employer}" },
              {
                title: passage.source.title,
                employer: passage.source.employer,
              }
            )
          : t.formatMessage({ defaultMessage: "From your profile" })}
      </span>
    </div>
  );
}

/** An instruction point a line rests on, quoted. */
function InstructionQuote({ text }: { text: string }) {
  const t = useTranslation();
  return (
    <div className="flex flex-col gap-0.5">
      <span>
        {t.formatMessage({ defaultMessage: "“{quote}”" }, { quote: text })}
      </span>
      <span className="opacity-70">
        {t.formatMessage({
          defaultMessage: "From this application's instructions",
        })}
      </span>
    </div>
  );
}

/**
 * Where a line came from (resume spec, "Trace in the editor"): the profile
 * passages, the application's instructions, and, for a cover letter, the
 * company facts and the motivation points it rests on; or "written by you".
 */
export function TraceContent({
  origin,
  version,
}: {
  origin: LineOrigin;
  version: VersionView;
}) {
  const t = useTranslation();
  if (origin.kind === "manual") {
    return <>{t.formatMessage({ defaultMessage: "Written by you" })}</>;
  }
  if (origin.kind === "credential") {
    return (
      <>
        {t.formatMessage({
          defaultMessage: "A credential, as your profile states it",
        })}
      </>
    );
  }
  const evidence = version.trace.filter((row) =>
    origin.evidenceIds.includes(row.evidenceId)
  );
  const instructions =
    origin.kind === "instruction" || origin.kind === "letter"
      ? version.instructionTrace.filter((row) =>
          origin.instructionIds.includes(row.instructionId)
        )
      : [];
  const facts =
    origin.kind === "letter"
      ? (version.letterTrace?.companyFacts ?? []).filter((row) =>
          origin.companyFactIds.includes(row.id)
        )
      : [];
  const words =
    origin.kind === "letter"
      ? (version.letterTrace?.motivationPoints ?? []).filter((row) =>
          origin.motivationPointIds.includes(row.id)
        )
      : [];
  if (
    !evidence.length &&
    !instructions.length &&
    !facts.length &&
    !words.length
  ) {
    return <>{t.formatMessage({ defaultMessage: "From your profile" })}</>;
  }
  return (
    <div className="flex flex-col gap-2">
      {instructions.map((row) => (
        <InstructionQuote key={row.instructionId} text={row.text} />
      ))}
      {evidence.map((row) => (
        <ProfilePassage key={row.evidenceId} passage={row} />
      ))}
      {facts.map((row) => (
        <span key={row.id}>
          {t.formatMessage(
            { defaultMessage: "{fact} (from the company research)" },
            { fact: row.text }
          )}
        </span>
      ))}
      {words.map((row) => (
        <span key={row.id}>
          {t.formatMessage(
            { defaultMessage: "“{quote}” (your motivation)" },
            { quote: row.text }
          )}
        </span>
      ))}
    </div>
  );
}

/** Where lines come from: evidence by id and instruction points' text. */
export type TraceIndex = {
  evidence: Map<string, EvidenceTrace>;
  instructions: Map<string, string>;
};

/**
 * A line with its origin on hover, colored by origin in trace mode (the
 * LinkedIn editor's lines; the document editor draws its own).
 */
export function TracedLine({
  lineId,
  origin,
  trace,
  traceIndex,
  children,
}: {
  lineId: string;
  origin: LineOrigin;
  trace: boolean;
  traceIndex: TraceIndex;
  children: ReactNode;
}) {
  const t = useTranslation();
  const sources =
    origin.kind === "manual" || origin.kind === "credential"
      ? []
      : origin.evidenceIds.flatMap((id) => traceIndex.evidence.get(id) ?? []);
  const instructions =
    origin.kind === "instruction"
      ? origin.instructionIds.flatMap(
          (id) => traceIndex.instructions.get(id) ?? []
        )
      : [];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          // The anchor a coverage finding about this line scrolls to.
          data-line-id={lineId}
          className={cn(
            "rounded-sm border-l-2 border-transparent pl-1.5",
            trace && originTone[origin.kind]
          )}
        >
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-sm">
        {origin.kind === "manual" ? (
          t.formatMessage({ defaultMessage: "Written by you" })
        ) : sources.length > 0 || instructions.length > 0 ? (
          <div className="flex flex-col gap-2">
            {instructions.map((text) => (
              <InstructionQuote key={text} text={text} />
            ))}
            {sources.map((source) => (
              <ProfilePassage key={source.evidenceId} passage={source} />
            ))}
          </div>
        ) : (
          t.formatMessage({ defaultMessage: "From your profile" })
        )}
      </TooltipContent>
    </Tooltip>
  );
}

const openDelayMs = 400;
const closeDelayMs = 120;

/**
 * The trace card over a block of the document editor (resume spec, "Trace
 * in the editor"): it opens when the pointer rests on a line (its origin)
 * or on a locked fact (why it is locked), and gives way to the finding
 * card where a finding is underlined.
 */
export function TraceHoverCard({
  editor,
  describe,
}: {
  editor: Editor | null;
  /** What to say about the block under the pointer, if anything. */
  describe: (element: HTMLElement) => ReactNode | null;
}) {
  const [card, setCard] = useState<{
    element: HTMLElement;
    left: number;
    top: number;
  } | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const close = () => {
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
      setCard(null);
    };
    const target = (event: Event) => {
      const element = event.target as HTMLElement | null;
      if (element?.closest("[data-finding]")) return null;
      return element?.closest<HTMLElement>("[data-document-block]") ?? null;
    };
    const over = (event: MouseEvent) => {
      const element = target(event);
      if (!element) return;
      clearTimeout(closeTimer.current);
      clearTimeout(openTimer.current);
      openTimer.current = setTimeout(() => {
        const rect = element.getBoundingClientRect();
        setCard({ element, left: rect.left, top: rect.bottom + 4 });
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
      close();
      dom.removeEventListener("mouseover", over);
      dom.removeEventListener("mouseout", out);
      dom.removeEventListener("keydown", close);
      editor.off("update", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [editor]);

  const content = card ? describe(card.element) : null;
  if (!card || !content) return null;
  return (
    <div
      role="tooltip"
      className="bg-popover text-popover-foreground fixed z-50 max-w-sm rounded-md border p-2.5 text-xs shadow-md"
      style={{
        left: Math.min(card.left, window.innerWidth - 400),
        top: card.top,
      }}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => clearTimeout(closeTimer.current)}
      onMouseLeave={() => {
        closeTimer.current = setTimeout(() => setCard(null), closeDelayMs);
      }}
    >
      {content}
    </div>
  );
}
