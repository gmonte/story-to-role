"use client";

import {
  acceptedDocumentTypes,
  documentLimits,
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

/**
 * Uploads career sources: format, size and the slots left are checked here
 * first; the server checks them again (the content too) and has the last
 * word. Each upload starts the file's import into profile suggestions.
 */
export function useSourceUpload({
  documents,
  beforeUpload,
}: {
  documents: Timeline["documents"];
  // In the editor: saves the draft first, so the import compares with it.
  beforeUpload?: () => Promise<unknown>;
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
    const { importError } = (await response.json()) as {
      importError: string | null;
    };
    if (importError) {
      toast.error(
        importError === "PAYMENT_REQUIRED"
          ? t.formatMessage({
              defaultMessage:
                "The file is saved, but you don't have the credits to import it now. Import it from Sources when you do.",
            })
          : t.formatMessage({
              defaultMessage:
                "The file is saved, but its import couldn't start. Try it again from Sources.",
            })
      );
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
    const free = documentLimits.maxSources - documents.length;
    if (valid.length > free) toast.error(tooMany);
    const accepted = valid.slice(0, Math.max(free, 0));
    if (!accepted.length) return;
    void (async () => {
      await beforeUpload?.();
      await Promise.all(accepted.map(upload));
    })();
  }

  return { add };
}
