"use client";

import { useState } from "react";

import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";

import type { ResumeSectionKind } from "@repo/api/domains/documents/schemas/resume-content";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { cn } from "@repo/web/lib/utils";

import { isResumeSection } from "../utils/document-blocks";
import { useDocumentEditor } from "./document-editor-context";

type Item = {
  index: number;
  title: string;
  children: Item[];
  // Set on a resume section: it can be moved, with its content.
  kind?: ResumeSectionKind;
};

/**
 * The document's index (resume spec, "Document workspace"): its sections
 * and, under them, each position or project; a letter lists its
 * paragraphs. A dot marks a section with a finding that blocks.
 */
export function DocumentIndex() {
  const t = useTranslation();
  const { blocks, findings, goToBlock, moveSection } = useDocumentEditor();
  const [dragging, setDragging] = useState<ResumeSectionKind | null>(null);

  const items: Item[] = [];
  let paragraph = 0;
  blocks.forEach((block, index) => {
    switch (block.type) {
      case "sectionTitle":
        items.push({
          index,
          title: block.text,
          children: [],
          kind: isResumeSection(block.kind) ? block.kind : undefined,
        });
        break;
      case "entry": {
        const parent = items[items.length - 1];
        const title = blocks.find(
          (row) => row.type === "entryTitle" && row.ownerId === block.ownerId
        );
        const item = {
          index,
          title:
            title && "text" in title
              ? t.formatMessage(
                  { defaultMessage: "{employer} — {title}" },
                  { employer: block.text, title: title.text }
                )
              : block.text,
          children: [],
        };
        if (parent) parent.children.push(item);
        else items.push(item);
        break;
      }
      case "greeting":
        items.push({
          index,
          title: t.formatMessage({ defaultMessage: "Greeting" }),
          children: [],
        });
        break;
      case "paragraph":
        paragraph += 1;
        items.push({
          index,
          title: t.formatMessage(
            { defaultMessage: "Paragraph {number}" },
            { number: paragraph }
          ),
          children: [],
        });
        break;
      case "closing":
        items.push({
          index,
          title: t.formatMessage({ defaultMessage: "Closing" }),
          children: [],
        });
        break;
      default:
        break;
    }
  });

  // The blocks a blocking finding points at, to mark their section.
  const flagged = new Set<number>();
  for (const finding of findings) {
    const at = blocks.findIndex((block) =>
      finding.lineId
        ? "lineId" in block && block.lineId === finding.lineId
        : finding.positionId
          ? block.type === "entry" && block.ownerId === finding.positionId
          : false
    );
    if (at >= 0) flagged.add(at);
  }
  const hasFlag = (start: number, end: number) =>
    [...flagged].some((at) => at >= start && at < end);

  const sectionKinds = items.flatMap((item) => (item.kind ? [item.kind] : []));

  return (
    <nav aria-label={t.formatMessage({ defaultMessage: "Document index" })}>
      <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
        {t.formatMessage({ defaultMessage: "Index" })}
      </p>
      <ul className="space-y-0.5 text-sm">
        {items.map((item, position) => {
          const end = items[position + 1]?.index ?? blocks.length;
          const kind = item.kind;
          const place = kind ? sectionKinds.indexOf(kind) : -1;
          return (
            <li
              key={item.index}
              onDragOver={
                kind && dragging ? (event) => event.preventDefault() : undefined
              }
              onDrop={
                kind && dragging
                  ? (event) => {
                      event.preventDefault();
                      moveSection(dragging, place);
                      setDragging(null);
                    }
                  : undefined
              }
              className={cn(kind && dragging === kind && "opacity-50")}
            >
              <div className="group hover:bg-muted flex items-center rounded">
                {kind && (
                  <span
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      setDragging(kind);
                    }}
                    onDragEnd={() => setDragging(null)}
                    aria-hidden="true"
                    className="text-muted-foreground cursor-grab px-0.5"
                  >
                    <GripVertical className="size-3.5" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => goToBlock(item.index)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left"
                >
                  <span className="truncate">{item.title}</span>
                  {hasFlag(item.index, end) && (
                    <span className="bg-destructive size-1.5 shrink-0 rounded-full" />
                  )}
                </button>
                {kind && (
                  <span className="flex shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      disabled={place <= 0}
                      onClick={() => moveSection(kind, place - 1)}
                      aria-label={t.formatMessage(
                        { defaultMessage: "Move {section} up" },
                        { section: item.title }
                      )}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      disabled={place >= sectionKinds.length - 1}
                      onClick={() => moveSection(kind, place + 1)}
                      aria-label={t.formatMessage(
                        { defaultMessage: "Move {section} down" },
                        { section: item.title }
                      )}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                  </span>
                )}
              </div>
              {item.children.length > 0 && (
                <ul className="border-muted ml-3 border-l pl-2">
                  {item.children.map((child) => (
                    <li key={child.index}>
                      <button
                        type="button"
                        onClick={() => goToBlock(child.index)}
                        className={cn(
                          "text-muted-foreground hover:bg-muted hover:text-foreground w-full truncate rounded px-2 py-0.5 text-left text-xs"
                        )}
                      >
                        {child.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
