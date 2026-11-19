import type { ProfileSuggestion } from "@repo/api/domains/profile/schemas/profile";
import { parseFragment } from "@repo/api/domains/profile/truth/suggestions";
import { buttonVariants } from "@repo/web/components/ui/button";
import { cn } from "@repo/web/lib/utils";

import { lineDiff } from "./word-diff";

export type SuggestionWidgetLabels = {
  accept: string;
  // Keep the old lines and add the new ones after them.
  both: string;
  reject: string;
  removal: string;
};

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
 * A suggestion as a tracked change in the text (profile spec,
 * "Suggestions"): the lines it would write, why, and Accept or Reject.
 * Plain DOM, since it lives inside the editor's own.
 */
export function suggestionWidget(
  suggestion: ProfileSuggestion,
  labels: SuggestionWidgetLabels,
  handlers: {
    accept: (profileSuggestionId: string) => void;
    both: (profileSuggestionId: string) => void;
    reject: (profileSuggestionId: string) => void;
  }
) {
  const root = document.createElement("div");
  root.className = "profile-suggestion";
  // Beside the document's blocks, not one of them: the margin's handle
  // skips it.
  root.setAttribute("data-profile-aside", "");
  root.setAttribute("data-suggestion-id", suggestion.id);
  root.contentEditable = "false";

  const lines = parseFragment(suggestion.replace);
  const diff = lineDiff(
    parseFragment(suggestion.find).map((block) => block.text),
    lines.map((block) => block.text)
  );
  for (const [index, block] of lines.entries()) {
    const line = document.createElement("div");
    line.className = `profile-suggestion-new profile-suggestion-${block.type}`;
    if (!diff.fallback) line.classList.add("profile-suggestion-new-diff");
    if (block.type === "item") {
      line.style.marginLeft = `${block.depth * 1.25}rem`;
      // The bullet is drawn by the stylesheet, hanging like the editor's.
      line.setAttribute("data-depth", String(block.depth));
    }
    if (diff.fallback) {
      line.append(block.text);
    } else {
      for (const segment of diff.new[index] ?? []) {
        if (!segment.changed) {
          line.append(segment.text);
          continue;
        }
        const added = document.createElement("ins");
        added.className = "profile-suggestion-added";
        added.textContent = segment.text;
        line.append(added);
      }
    }
    root.append(line);
  }
  if (!lines.length) {
    const removal = document.createElement("div");
    removal.className = "profile-suggestion-note";
    removal.textContent = labels.removal;
    root.append(removal);
  }

  const footer = document.createElement("div");
  footer.className = "profile-suggestion-footer";
  const reason = document.createElement("span");
  reason.className = "profile-suggestion-reason";
  reason.textContent = suggestion.reason;
  footer.append(
    reason,
    button(labels.accept, cn(buttonVariants(), small), () =>
      handlers.accept(suggestion.id)
    ),
    button(
      labels.reject,
      cn(buttonVariants({ variant: "outline" }), small),
      () => handlers.reject(suggestion.id)
    ),
    // Only a suggestion that replaces lines with new ones can keep both.
    ...(suggestion.find.trim() && suggestion.replace.trim()
      ? [
          button(
            labels.both,
            cn(buttonVariants({ variant: "link" }), small),
            () => handlers.both(suggestion.id)
          ),
        ]
      : [])
  );
  root.append(footer);
  return root;
}
