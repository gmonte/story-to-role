import type { ProfileSuggestion } from "@repo/api/domains/profile/schemas/profile";
import { parseFragment } from "@repo/api/domains/profile/truth/suggestions";

export type SuggestionWidgetLabels = {
  accept: string;
  reject: string;
  removal: string;
};

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
  handlers: { accept: (id: string) => void; reject: (id: string) => void }
) {
  const root = document.createElement("div");
  root.className = "profile-suggestion";
  // Not a block of the document: the margin's handle skips it.
  root.setAttribute("data-profile-hint", "");
  root.setAttribute("data-suggestion-id", suggestion.id);
  root.contentEditable = "false";

  const lines = parseFragment(suggestion.replace);
  for (const block of lines) {
    const line = document.createElement("div");
    line.className = `profile-suggestion-new profile-suggestion-${block.type}`;
    if (block.type === "item") {
      line.style.marginLeft = `${block.depth * 1.25}rem`;
      line.textContent = `• ${block.text}`;
    } else {
      line.textContent = block.text;
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
    button(labels.accept, "profile-suggestion-accept", () =>
      handlers.accept(suggestion.id)
    ),
    button(labels.reject, "profile-suggestion-reject", () =>
      handlers.reject(suggestion.id)
    )
  );
  root.append(footer);
  return root;
}
