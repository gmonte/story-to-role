"use client";

import { ArrowUp } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Textarea } from "@repo/web/components/ui/textarea";

/**
 * The chat column: a conversation above and the composer below. Every chat
 * belongs to a context; until that context's feature arrives the composer
 * stays disabled and the column explains what will happen here.
 */
export function ChatPlaceholder({
  heading,
  description,
}: {
  heading: string;
  description: string;
}) {
  const t = useTranslation();

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          {heading}
        </h2>
        <p className="text-muted-foreground max-w-md text-sm">{description}</p>
      </div>
      <div className="mx-auto w-full max-w-3xl p-4">
        <div className="bg-card border-input relative rounded-[10px] border px-3 py-2.5">
          <Textarea
            disabled
            rows={2}
            placeholder={t.formatMessage({ defaultMessage: "Coming soon." })}
            className="min-h-10 resize-none rounded-none border-0 bg-transparent p-0 pr-10 text-sm shadow-none focus-visible:ring-0 md:text-sm dark:bg-transparent"
          />
          <Button
            size="icon"
            disabled
            className="absolute right-3 bottom-2.5 size-7 rounded-full"
            aria-label={t.formatMessage({ defaultMessage: "Send" })}
          >
            <ArrowUp />
          </Button>
        </div>
      </div>
    </div>
  );
}
