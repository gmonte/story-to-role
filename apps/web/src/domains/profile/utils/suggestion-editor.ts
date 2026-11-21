import { buttonVariants } from "@repo/web/components/ui/button";
import { cn } from "@repo/web/lib/utils";

import {
  acceptButtonClass,
  checkIcon,
  decisionButton,
} from "~/domains/workspace/utils/decision-buttons";

export type SuggestionEditorLabels = {
  edit: string;
  acceptEdited: string;
  cancel: string;
};

const small = decisionButton;

function button(
  label: string,
  className: string,
  onClick: () => void,
  icon?: string
) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  // A static, local SVG (decision-buttons), then the label as text.
  if (icon) element.innerHTML = icon;
  element.append(label);
  // The editor keeps its selection: the click isn't a place in the text.
  element.addEventListener("mousedown", (event) => event.preventDefault());
  element.addEventListener("click", onClick);
  return element;
}

/**
 * The manual edit of a suggestion's proposed text, in place (plain DOM,
 * shared by the profile's and the documents' widgets): an Edit button and
 * a panel with a textarea prefilled with the proposal, "Accept edited" and
 * Cancel. While editing, `hide` (the diff, the usual buttons) is hidden.
 * Cmd/Ctrl+Enter accepts, Escape cancels.
 */
export function suggestionEditor(options: {
  initial: string;
  labels: SuggestionEditorLabels;
  hide: HTMLElement[];
  onAccept: (edited: string) => void;
}) {
  const { initial, labels, hide } = options;
  const panel = document.createElement("div");
  panel.className = cn("mt-1.5 flex flex-col gap-1.5");
  panel.hidden = true;
  const field = document.createElement("textarea");
  field.value = initial;
  field.rows = Math.min(10, Math.max(2, initial.split("\n").length + 1));
  field.className = cn(
    "border-input bg-background text-foreground focus-visible:ring-ring w-full resize-y rounded-md border px-2 py-1.5 text-sm outline-none focus-visible:ring-2"
  );
  const toggle = (editing: boolean) => {
    panel.hidden = !editing;
    for (const element of hide) element.hidden = editing;
    if (editing) {
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    }
  };
  const cancel = () => {
    field.value = initial;
    toggle(false);
  };
  const accept = () => options.onAccept(field.value);
  // The editor must not see the keys typed here.
  field.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      accept();
    }
  });
  for (const type of ["keyup", "keypress", "beforeinput", "input", "paste"]) {
    field.addEventListener(type, (event) => event.stopPropagation());
  }
  const actions = document.createElement("div");
  actions.className = cn("flex flex-wrap items-center gap-2");
  actions.append(
    button(labels.acceptEdited, acceptButtonClass, accept, checkIcon),
    button(
      labels.cancel,
      cn(buttonVariants({ variant: "outline" }), small),
      cancel
    )
  );
  panel.append(field, actions);
  const editButton = button(
    labels.edit,
    cn(buttonVariants({ variant: "outline" }), small),
    () => toggle(true)
  );
  return { editButton, panel };
}
