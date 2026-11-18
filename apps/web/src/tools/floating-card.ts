import type { CSSProperties } from "react";

// Space kept between a card and the anchor, and from the viewport's edges.
const gapPx = 4;
const marginPx = 8;
// A card never grows past this share of the viewport; it scrolls instead.
const maxHeightShare = 0.6;
// Below this much room, the card opens on the other side when it has more.
const minRoomPx = 160;

/**
 * Where a fixed-position card goes so it stays inside the viewport: under
 * the anchor, or above it when there is more room there; its height capped
 * to the room it has (at most 60% of the viewport), so a long card scrolls
 * instead of running off screen; and never past the right or left edge.
 */
export function floatingCardStyle(
  anchor: Pick<DOMRect, "left" | "top" | "bottom">,
  width: number
): CSSProperties {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const cap = Math.round(viewportHeight * maxHeightShare);
  const below = viewportHeight - anchor.bottom - gapPx - marginPx;
  const above = anchor.top - gapPx - marginPx;
  const opensAbove = below < Math.min(cap, minRoomPx) && above > below;
  const maxHeight = Math.max(
    minRoomPx / 2,
    Math.min(cap, opensAbove ? above : below)
  );
  const left = Math.max(
    marginPx,
    Math.min(anchor.left, viewportWidth - width - marginPx)
  );
  return opensAbove
    ? { left, bottom: viewportHeight - anchor.top + gapPx, maxHeight }
    : { left, top: anchor.bottom + gapPx, maxHeight };
}
