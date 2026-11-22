import type { MouseEvent } from "react";

// What answers a click itself, inside a card.
const controls = "button, a, input, textarea, select, [role='button']";

/**
 * A card that opens its target on a click anywhere on it, except on its
 * own controls (they act for themselves) and while the user is selecting
 * its text. Keep a focusable control in the card for the keyboard.
 */
export function onCardClick(open: () => void) {
  return (event: MouseEvent) => {
    if ((event.target as Element).closest(controls)) return;
    if (window.getSelection()?.toString()) return;
    open();
  };
}
