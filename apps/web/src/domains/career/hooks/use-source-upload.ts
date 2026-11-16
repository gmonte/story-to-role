"use client";

import {
  acceptedDocumentTypes,
  documentLimits,
  slotStatuses,
  typesByExtension,
} from "@repo/api/domains/career/documents/document-limits";
import type { Timeline } from "@repo/api/domains/career/schemas/timeline";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { useTranslation } from "@repo/intl/use-translation";
import { toast } from "@repo/web/components/ui/sonner";

import {
  type CreditsShortfall,
  useOutOfCreditsToast,
} from "~/domains/credits/components/out-of-credits-notice";

import { useRefreshCareer } from "./use-career-queries";

const extensions = Object.keys(typesByExtension);

/** What a file input takes: the source formats, by extension and type. */
export const sourceAccept = [
  ...extensions.map((extension) => `.${extension}`),
  ...Object.keys(acceptedDocumentTypes),
].join(",");

export const sourceMegabytes = documentLimits.maxBytes / (1024 * 1024);

/** A running import, with the name of its file. */
export type SourceImport = RealtimeSubscription & { fileName: string };

const takesSlot = (document: Timeline["documents"][number]) =>
  (slotStatuses as readonly string[]).includes(document.status);

/**
 * Uploads career sources, from the Sources panel or the career chat alike:
 * format, size and the slots left are checked here first; the server checks
 * them again (the content too) and has the last word. Each upload that
 * starts an import is handed to `onStarted`.
 */
export function useSourceUpload({
  documents,
  onStarted,
}: {
  documents: Timeline["documents"];
  onStarted: (started: SourceImport) => void;
}) {
  const t = useTranslation();
  const refresh = useRefreshCareer();
  const showOutOfCredits = useOutOfCreditsToast();

  const invalidFile = t.formatMessage(
    {
      defaultMessage:
        "That file couldn't be imported. Use a PDF, DOCX, Markdown or text file up to {megabytes, number} MB.",
    },
    { megabytes: sourceMegabytes }
  );
  const tooMany = t.formatMessage(
    {
      defaultMessage:
        "You can keep up to {max, number} sources. Remove one to add another.",
    },
    { max: documentLimits.maxSources }
  );

  async function upload(file: File) {
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/career/documents", {
      method: "POST",
      body: form,
    });
    if (response.status === 402) {
      const { credits } = (await response.json()) as {
        credits: CreditsShortfall;
      };
      showOutOfCredits(credits);
      return;
    }
    if (!response.ok) {
      toast.error(response.status === 409 ? tooMany : invalidFile);
      return;
    }
    const { realtime } = (await response.json()) as {
      realtime: RealtimeSubscription;
    };
    onStarted({ ...realtime, fileName: file.name });
    await refresh();
  }

  function add(files: File[]) {
    const valid = files.filter((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      return (
        extensions.includes(extension) &&
        file.size > 0 &&
        file.size <= documentLimits.maxBytes
      );
    });
    if (valid.length < files.length) toast.error(invalidFile);
    // As many as fit; the rest wait for a free slot.
    const free = documentLimits.maxSources - documents.filter(takesSlot).length;
    if (valid.length > free) toast.error(tooMany);
    for (const file of valid.slice(0, Math.max(free, 0))) void upload(file);
  }

  return { add };
}
