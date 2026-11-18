import {
  skillsPart,
  splitChangeLines,
} from "@repo/api/domains/documents/changes/document-change";
import type { DocumentChange } from "@repo/api/domains/documents/schemas/document-change";
import { buttonVariants } from "@repo/web/components/ui/button";
import { cn } from "@repo/web/lib/utils";

import { lineDiff } from "~/domains/profile/utils/word-diff";

export type ChangeWidgetLabels = {
  accept: string;
  reject: string;
  removal: string;
};

/** The classes of the lines a change replaces, drawn over the blocks. */
// The lines a change replaces sit in a red box, the twin of the green box
// with what it writes, so it's clear which lines are being replaced.
export const replacedBlockClass = (fallback: boolean) =>
  cn(
    "border-destructive/40 bg-destructive/10 my-1.5 rounded-lg border px-3 py-2",
    fallback && "line-through decoration-destructive/60"
  );

/** The words a change removes, inside a line it rewrites. */
export const removedWordsClass = cn(
  "bg-destructive/20 text-foreground line-through decoration-destructive/70"
);

const addedWordsClass = cn(
  "bg-emerald-500/25 no-underline dark:bg-emerald-500/30"
);

// The app's Button, small, as classes: the widget is plain DOM.
const small = "h-7 px-2.5 text-xs";

function button(label: string, className: string, onClick: () => void) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  // The editor keeps its selection: the click isn't a place in the text.
  element.addEventListener("mousedown", (event) => event.preventDefault());
  element.addEventListener("click", onClick);
  return element;
}

/**
 * A change as a tracked change in the document (ADR 0009): the lines it
 * would write with the inserted words highlighted, why, and Accept or
 * Reject. Plain DOM, since it lives inside the editor's own.
 */
export function changeWidget(
  change: DocumentChange,
  replaced: string[],
  labels: ChangeWidgetLabels,
  handlers: {
    accept: (documentChangeId: string) => void;
    reject: (documentChangeId: string) => void;
  }
) {
  const root = document.createElement("div");
  root.className = cn(
    "my-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm"
  );
  root.setAttribute("data-document-change-id", change.id);
  root.contentEditable = "false";

  const lines = splitChangeLines(change.replace);
  const diff = lineDiff(replaced, lines);
  for (const [index, text] of lines.entries()) {
    const line = document.createElement("div");
    line.className = cn(
      change.part === skillsPart ? "" : "relative pl-4",
      diff.fallback
        ? "text-emerald-800 dark:text-emerald-200"
        : "text-foreground"
    );
    if (change.part !== skillsPart) {
      const marker = document.createElement("span");
      marker.className = cn("absolute left-1");
      marker.textContent = "•";
      line.append(marker);
    }
    if (diff.fallback) {
      line.append(text);
    } else {
      for (const segment of diff.new[index] ?? []) {
        if (!segment.changed) {
          line.append(segment.text);
          continue;
        }
        const added = document.createElement("ins");
        added.className = addedWordsClass;
        added.textContent = segment.text;
        line.append(added);
      }
    }
    root.append(line);
  }
  if (!lines.length) {
    const removal = document.createElement("div");
    removal.className = cn("text-muted-foreground text-xs italic");
    removal.textContent = labels.removal;
    root.append(removal);
  }

  const footer = document.createElement("div");
  footer.className = cn("mt-1.5 flex flex-wrap items-center gap-2");
  const reason = document.createElement("span");
  reason.className = cn("text-muted-foreground min-w-48 flex-1 text-xs");
  reason.textContent = change.reason;
  footer.append(
    reason,
    button(labels.accept, cn(buttonVariants(), small), () =>
      handlers.accept(change.id)
    ),
    button(
      labels.reject,
      cn(buttonVariants({ variant: "outline" }), small),
      () => handlers.reject(change.id)
    )
  );
  root.append(footer);
  return root;
}
