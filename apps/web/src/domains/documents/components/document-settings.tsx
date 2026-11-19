"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";

import type { GenerationSettings } from "@repo/api/domains/documents/schemas/generation-settings";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/web/components/ui/collapsible";

import { GenerationSettingsFields } from "./generation-settings-fields";

/**
 * The generation settings in a generation dialog, prefilled with the
 * user's defaults: what changes here holds for this document only.
 */
export function DocumentSettings({
  value,
  onChange,
  letter = false,
}: {
  /** Undefined until the user's defaults are read. */
  value: GenerationSettings | undefined;
  onChange: (value: GenerationSettings) => void;
  /** A cover letter: shows only the letter's fields. */
  letter?: boolean;
}) {
  const t = useTranslation();
  if (!value) return null;
  return (
    // Shown each time a document is generated (resume spec): open, so what
    // the document will be written with is in sight.
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="text-muted-foreground flex items-center gap-1 text-xs hover:underline">
        <ChevronDown className="size-3.5" />
        {t.formatMessage({ defaultMessage: "Settings for this document" })}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 grid gap-2.5">
        <GenerationSettingsFields
          value={value}
          onChange={onChange}
          show={letter ? "letter" : "resume"}
        />
        <p className="text-muted-foreground text-xs">
          {t.formatMessage({
            defaultMessage:
              "What you change here holds for this document only.",
          })}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Nothing is generated before a profile is published: where to do it. */
export function PublishProfileNotice() {
  const t = useTranslation();
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
      <p>
        {t.formatMessage({
          defaultMessage:
            "Documents are written only from your published profile. Review and publish it in My career first.",
        })}
      </p>
      <Button asChild size="sm" variant="outline" className="h-7">
        <Link href="/app/career">
          {t.formatMessage({ defaultMessage: "Go to My career" })}
        </Link>
      </Button>
    </div>
  );
}
