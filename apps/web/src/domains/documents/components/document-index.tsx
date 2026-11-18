"use client";

import { useTranslation } from "@repo/intl/use-translation";
import { cn } from "@repo/web/lib/utils";

import { useDocumentEditor } from "./document-editor-context";

type Item = { index: number; title: string; children: Item[] };

/**
 * The document's index (resume spec, "Document workspace"): its sections
 * and, under them, each position or project; a letter lists its
 * paragraphs. A dot marks a section with a finding that blocks.
 */
export function DocumentIndex() {
  const t = useTranslation();
  const { blocks, findings, goToBlock } = useDocumentEditor();

  const items: Item[] = [];
  let paragraph = 0;
  blocks.forEach((block, index) => {
    switch (block.type) {
      case "sectionTitle":
        items.push({ index, title: block.text, children: [] });
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

  return (
    <nav aria-label={t.formatMessage({ defaultMessage: "Document index" })}>
      <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
        {t.formatMessage({ defaultMessage: "Index" })}
      </p>
      <ul className="space-y-0.5 text-sm">
        {items.map((item, position) => {
          const end = items[position + 1]?.index ?? blocks.length;
          return (
            <li key={item.index}>
              <button
                type="button"
                onClick={() => goToBlock(item.index)}
                className="hover:bg-muted flex w-full items-center gap-2 rounded px-2 py-1 text-left"
              >
                <span className="truncate">{item.title}</span>
                {hasFlag(item.index, end) && (
                  <span className="bg-destructive size-1.5 shrink-0 rounded-full" />
                )}
              </button>
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
