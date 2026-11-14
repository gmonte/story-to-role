import { cn } from "@repo/web/lib/utils";

import { BrandMark } from "./brand-mark";

// The brand name is never translated.
const BRAND_NAME = "StoryToRole";

/** The mark plus “StoryToRole” in Space Grotesk 600, in one color. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <span
      className={cn("text-brand-ink flex items-center gap-2", className)}
      aria-label={BRAND_NAME}
    >
      <BrandMark oneColor className="size-6" />
      <span className="font-display text-lg leading-none font-semibold tracking-tight">
        {BRAND_NAME}
      </span>
    </span>
  );
}
