"use client";

import { useTranslation } from "@repo/intl/use-translation";

/** A section of the profile modal whose feature arrives in a later stage. */
export function ProfilePagePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const t = useTranslation();

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-muted-foreground text-sm">{description}</p>
      <p className="text-muted-foreground text-sm">
        {t.formatMessage({ defaultMessage: "Coming soon." })}
      </p>
    </div>
  );
}
