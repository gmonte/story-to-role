"use client";

import type { ReactNode } from "react";

import { useMutation } from "@tanstack/react-query";

import type { CoverLetterContent } from "@repo/api/domains/documents/schemas/cover-letter-content";
import type { DocumentView } from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";

import { AiAtWork } from "~/domains/workspace/components/ai-at-work";
import { useTRPC } from "~/tools/trpc/client";

import { useRefreshDocuments } from "../hooks/use-opening-documents";
import { useSelectedVersion } from "../hooks/use-selected-version";
import { DocumentWorkspace } from "./document-workspace";

/**
 * A cover letter in the document workspace: the resume's header, then the
 * letter, every paragraph editable and traced to its sources; outdated
 * once its resume changes, with the update offered as a proposal.
 */
export function CoverLetterWorkspace({
  document,
  aside,
}: {
  document: DocumentView;
  aside?: ReactNode;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const { selected: version, select } = useSelectedVersion(
    document.versions,
    "letter"
  );
  const onError = (error: { message: string }) => toast.error(error.message);
  const update = useMutation(
    trpc.letters.update.mutationOptions({ onSuccess: refresh, onError })
  );
  const dismiss = useMutation(
    trpc.letters.dismissOutdated.mutationOptions({
      onSuccess: refresh,
      onError,
    })
  );
  if (version?.content.kind !== "cover_letter") return null;
  const generating =
    document.generation?.status === "pending" ||
    document.generation?.status === "running";
  const notices = [
    generating && (
      <AiAtWork
        key="generating"
        title={t.formatMessage({
          defaultMessage: "Writing your cover letter from your story",
        })}
      />
    ),
    version.letter?.motivationSkipped && (
      <Badge key="skipped" variant="outline" className="self-start">
        {t.formatMessage({
          defaultMessage: "Could improve with your motivation",
        })}
      </Badge>
    ),
    version.letter?.outdated && (
      <div
        key="outdated"
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs"
      >
        <span>
          {t.formatMessage({
            defaultMessage: "The resume changed after this letter was written.",
          })}
        </span>
        <div className="flex gap-1">
          <Button
            size="sm"
            disabled={update.isPending}
            onClick={() => update.mutate({ versionId: version.id })}
          >
            {t.formatMessage({ defaultMessage: "Update the cover letter" })}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={dismiss.isPending}
            onClick={() => dismiss.mutate({ versionId: version.id })}
          >
            {t.formatMessage({ defaultMessage: "Keep it as it is" })}
          </Button>
        </div>
      </div>
    ),
    version.pages > 1 && (
      <p
        key="pages"
        className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs"
      >
        {t.formatMessage(
          {
            defaultMessage:
              "Over one page: a cover letter reads best short. Start with paragraph {position}, the longest.",
          },
          { position: longestParagraph(version.content) + 1 }
        )}
      </p>
    ),
  ].filter(Boolean);

  return (
    <DocumentWorkspace
      version={version}
      versions={document.versions}
      select={select}
      aside={aside}
      notices={notices.length > 0 ? notices : null}
    />
  );
}

/** Where trimming helps most: the longest paragraph's index. */
function longestParagraph(content: CoverLetterContent) {
  return content.paragraphs.reduce(
    (longest, line, index, all) =>
      line.text.length > all[longest].text.length ? index : longest,
    0
  );
}
