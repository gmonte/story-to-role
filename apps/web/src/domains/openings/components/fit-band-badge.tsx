"use client";

import type { ComponentProps } from "react";

import type { FitBand } from "@repo/api/domains/openings/schemas/opening";
import { Badge } from "@repo/web/components/ui/badge";
import { cn } from "@repo/web/lib/utils";

import { useOpeningLabels } from "../hooks/use-opening-labels";
import {
  bandClassName,
  bandDotClassName,
  bandTextClassName,
} from "./fit-check-panel";

/** The band's dot in its color (ADR 0012: fit tokens). */
export function FitBandDot({
  band,
  className,
}: {
  band: FitBand;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        bandDotClassName(band),
        className
      )}
    />
  );
}

/**
 * The fit check's band as a soft fill in its color, wherever it shows
 * (ADR 0012: fit is a soft fill, an application's status an outline).
 */
export function FitBandBadge({
  band,
  className,
  ...props
}: { band: FitBand } & ComponentProps<typeof Badge>) {
  const labels = useOpeningLabels();
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border-transparent",
        bandClassName(band),
        bandTextClassName(band),
        className
      )}
      {...props}
    >
      <FitBandDot band={band} />
      {labels.band(band)}
    </Badge>
  );
}
