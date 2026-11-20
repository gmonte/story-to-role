import type { ReactNode } from "react";

import { cn } from "@repo/web/lib/utils";

/** A landing section's eyebrow, title and lead, centered by default. */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "center",
  className,
}: {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  align?: "center" | "start";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex max-w-2xl flex-col gap-3",
        align === "center" && "mx-auto items-center text-center",
        className
      )}
    >
      <span className="text-brand-accent text-xs font-semibold tracking-widest uppercase">
        {eyebrow}
      </span>
      <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {lead && (
        <p className="text-muted-foreground text-base text-pretty sm:text-lg">
          {lead}
        </p>
      )}
    </div>
  );
}

/** The landing page's content width and side gutters. */
export function LandingContainer({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>
      {children}
    </div>
  );
}
