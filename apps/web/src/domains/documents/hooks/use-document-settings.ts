"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import type { GenerationSettings } from "@repo/api/domains/documents/schemas/generation-settings";

import { useTRPC } from "~/tools/trpc/client";

/**
 * What a generation dialog reads once it is open (resume spec,
 * "Generation settings"): the user's default settings, which prefill the
 * form, what they changed there for this document only, and whether a
 * profile is published, without which nothing is generated.
 */
export function useDocumentSettings(open: boolean) {
  const trpc = useTRPC();
  const writing = useQuery({
    ...trpc.writing.get.queryOptions({}),
    enabled: open,
  });
  const profile = useQuery({
    ...trpc.profile.draft.queryOptions({}),
    enabled: open,
    // Publishing happens on another screen: each opening reads it again.
    staleTime: 0,
  });
  const [edited, setEdited] = useState<GenerationSettings | null>(null);
  const defaults = writing.data?.generationSettings;
  const changed =
    defaults && edited
      ? (Object.keys(defaults) as Array<keyof GenerationSettings>).filter(
          (key) => edited[key] !== defaults[key]
        )
      : [];

  return {
    /** The form's value: undefined until the defaults are read. */
    value: edited ?? defaults,
    onChange: setEdited,
    /** Back to the defaults, for a dialog that opens again. */
    reset: () => setEdited(null),
    /** Only what differs from the defaults, as the API takes it. */
    settings:
      edited && changed.length > 0
        ? (Object.fromEntries(
            changed.map((key) => [key, edited[key]])
          ) as Partial<GenerationSettings>)
        : undefined,
    unpublished: !!profile.data && !profile.data.publishedVersion,
  };
}
