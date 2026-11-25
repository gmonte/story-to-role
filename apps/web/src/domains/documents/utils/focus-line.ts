/**
 * Brings a document line (or an experience entry) into view and lights it
 * up for a moment, when the editor is on screen; a finding listed beside a
 * closed editor does nothing. The editor marks lines with `data-line-id`
 * and entries with `data-position-id`.
 */
export function focusDocumentLine(target: {
  lineId: string | null;
  positionId: string | null;
}) {
  const selector = target.lineId
    ? `[data-line-id="${target.lineId}"]`
    : target.positionId
      ? `[data-position-id="${target.positionId}"]`
      : null;
  const element = selector ? document.querySelector(selector) : null;
  if (!(element instanceof HTMLElement)) return false;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  const highlight = ["ring-2", "ring-destructive/60", "transition-shadow"];
  element.classList.add(...highlight);
  window.setTimeout(() => element.classList.remove(...highlight), 2000);
  return true;
}
