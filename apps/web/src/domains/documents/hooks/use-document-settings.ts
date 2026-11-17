"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  type GenerationSettings,
  generationSettingsSchema,
} from "@repo/api/domains/documents/schemas/generation-settings";

import { useTRPC } from "~/tools/trpc/client";

/**
 * What a generation dialog reads once it is open (resume spec,
 * "Generation settings"): the user's default settings, which prefill the
 * form, the form's value for this document only, and whether a profile is
 * published, without which nothing is generated.
 */
export function useDocumentSettings(open: boolean) {
  const trpc = useTRPC();
  const writing = useQuery({
    ...trpc.writing.get.queryOptions({}),
    enabled: open,
    // The defaults are edited on another screen: each opening reads them
    // again, so the form shows what the server would use.
    staleTime: 0,
  });
  const profile = useQuery({
    ...trpc.profile.draft.queryOptions({}),
    enabled: open,
    // Publishing happens on another screen: each opening reads it again.
    staleTime: 0,
  });
  const [edited, setEdited] = useState<GenerationSettings | null>(null);
  const value = edited ?? writing.data?.generationSettings;

  return {
    /** The form's value: undefined until the defaults are read. */
    value,
    onChange: setEdited,
    /** Back to the defaults, for a dialog that opens again. */
    reset: () => setEdited(null),
    /** What the form shows, sent whole: the document is written with it. */
    settings: value,
    /** A value the settings can't hold together (see the form's note). */
    invalid: !!value && !generationSettingsSchema.safeParse(value).success,
    unpublished: !!profile.data && !profile.data.publishedVersion,
  };
}
