import { cn } from "@repo/web/lib/utils";

/**
 * The StoryToRole mark: four lines whose ends trace an S, the last one in the
 * accent color ending in a dot. `oneColor` paints the accent line in ink too,
 * for a background where the accent would not show.
 */
export function BrandMark({
  className,
  oneColor = false,
}: {
  className?: string;
  oneColor?: boolean;
}) {
  const accent = oneColor ? "var(--brand-ink)" : "var(--brand-accent)";

  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn("size-8 shrink-0", className)}
    >
      <g strokeWidth="7" strokeLinecap="round" fill="none">
        <line x1="21" y1="13" x2="48" y2="13" stroke="var(--brand-ink)" />
        <line x1="11" y1="26" x2="35" y2="26" stroke="var(--brand-ink)" />
        <line x1="22" y1="39" x2="52" y2="39" stroke="var(--brand-ink)" />
        <line x1="10" y1="52" x2="41" y2="52" stroke={accent} />
      </g>
      <circle cx="52.5" cy="52" r="4.75" fill={accent} />
    </svg>
  );
}
