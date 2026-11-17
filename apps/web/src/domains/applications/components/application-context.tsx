"use client";

import { useTranslation } from "@repo/intl/use-translation";

import { useApplicationInstructions } from "../hooks/use-application-instructions";
import { ConfirmedInstructions } from "./instructions-review";
import { ActiveOverrides } from "./sensitive-overrides";

/**
 * The side panel's Context block (workspace spec): what the AI uses for
 * this application besides the profile: the instructions, the
 * locked-fact overrides and the sensitive items treated their own way.
 */
export function ApplicationContext({ openingId }: { openingId: string }) {
  const t = useTranslation();
  const instructions = useApplicationInstructions(openingId);
  if (!instructions.data) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        {t.formatMessage({ defaultMessage: "Context" })}
      </h3>
      <ConfirmedInstructions
        openingId={openingId}
        instructions={instructions.data}
      />
      <ActiveOverrides openingId={openingId} />
      {!instructions.data.points.some((point) => point.status === "kept") &&
        !instructions.data.overrides.some((row) => row.confirmed) && (
          <p className="text-muted-foreground text-xs">
            {t.formatMessage({
              defaultMessage:
                "Only your profile. Instructions you add when generating show here.",
            })}
          </p>
        )}
    </section>
  );
}
