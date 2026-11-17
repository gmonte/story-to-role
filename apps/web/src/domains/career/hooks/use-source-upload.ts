"use client";

import {
  acceptedDocumentTypes,
  documentLimits,
  slotStatuses,
  typesByExtension,
} from "@repo/api/domains/career/documents/document-limits";
import type { Timeline } from "@repo/api/domains/career/schemas/timeline";
import { useTranslation } from "@repo/intl/use-translation";
import { toast } from "@repo/web/components/ui/sonner";

import { useRefreshCareer } from "./use-career-queries";

const extensions = Object.keys(typesByExtension);

/** What a file input takes: the source formats, by extension and type. */
export const sourceAccept = [
  ...extensions.map((extension) => `.${extension}`),
  ...Object.keys(acceptedDocumentTypes),
].join(",");

export const sourceMegabytes = documentLimits.maxBytes / (1024 * 1024);

const takesSlot = (document: Timeline["documents"][number]) =>
  (slotStatuses as readonly string[]).includes(document.status);

/**
 * Uploads career sources: format, size and the slots left are checked here
 * first; the server checks them again (the content too) and has the last
 * word. A source is only stored for now (P4 re-adds importing).
 */
export function useSourceUpload({
  documents,
}: {
  documents: Timeline["documents"];
}) {
  const t = useTranslation();
  const refresh = useRefreshCareer();

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
    if (!response.ok) {
      toast.error(response.status === 409 ? tooMany : invalidFile);
      return;
    }
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
