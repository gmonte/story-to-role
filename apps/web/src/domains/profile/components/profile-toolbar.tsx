"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, History, Loader2, Send } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { serializeBlocks } from "@repo/api/domains/profile/truth/blocks";
import { hasFormatErrors } from "@repo/api/domains/profile/truth/lint";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/web/components/ui/tooltip";

import { useTRPC } from "~/tools/trpc/client";

import { useProfileEditor } from "./profile-editor-context";
import { VersionsDialog } from "./versions-dialog";

const dot = "·";

/**
 * Above the document: whether the draft is saved, which version is
 * published, and Publish (format findings block it; profile spec, "Validate
 * and publish"), the versions and the download of profile_truth.md.
 */
export function ProfileToolbar() {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { blocks, findings, saveStatus, saveNow, markdown, draft } =
    useProfileEditor();
  const [versionsOpen, setVersionsOpen] = useState(false);
  const versions = useQuery(trpc.profile.versions.queryOptions({}));
  const latest = versions.data?.[0] ?? draft.publishedVersion;
  const published = useQuery({
    ...trpc.profile.version.queryOptions({
      profileVersionId: latest?.id ?? "",
    }),
    enabled: !!latest,
  });
  const publish = useMutation(trpc.profile.publish.mutationOptions());

  const blocked = hasFormatErrors(findings);
  const changed = published.data?.markdown !== serializeBlocks(blocks);

  async function publishDraft() {
    const revision = await saveNow();
    if (revision === null || revision === 0) {
      toast.error(
        t.formatMessage({
          defaultMessage: "Save the profile before publishing.",
        })
      );
      return;
    }
    try {
      const result = await publish.mutateAsync({ baseRevision: revision });
      toast.success(
        t.formatMessage(
          { defaultMessage: "Version {number, number} published." },
          { number: result.number }
        )
      );
      await queryClient.invalidateQueries({ queryKey: trpc.profile.pathKey() });
    } catch {
      toast.error(
        t.formatMessage({
          defaultMessage: "The profile couldn't be published.",
        })
      );
    }
  }

  function download() {
    const file = new Blob([markdown()], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "profile_truth.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  const status = {
    saved: t.formatMessage({ defaultMessage: "Saved" }),
    pending: t.formatMessage({ defaultMessage: "Editing…" }),
    saving: t.formatMessage({ defaultMessage: "Saving…" }),
    error: t.formatMessage({
      defaultMessage: "Not saved: check your connection",
    }),
    conflict: t.formatMessage({
      defaultMessage: "Changed in another tab: reload to keep editing",
    }),
  }[saveStatus];

  return (
    <div className="bg-background/95 sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b px-4 py-2 backdrop-blur">
      <span
        className={
          saveStatus === "error" || saveStatus === "conflict"
            ? "text-destructive text-xs"
            : "text-muted-foreground text-xs"
        }
        aria-live="polite"
      >
        {status}
      </span>
      <span className="text-muted-foreground text-xs">{dot}</span>
      <span className="text-muted-foreground text-xs">
        {latest
          ? changed
            ? t.formatMessage(
                {
                  defaultMessage:
                    "Version {number, number} published; the draft has changes",
                },
                { number: latest.number }
              )
            : t.formatMessage(
                { defaultMessage: "Version {number, number} published" },
                { number: latest.number }
              )
          : t.formatMessage({ defaultMessage: "Not published yet" })}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={download}>
          <Download className="size-4" />
          {t.formatMessage({ defaultMessage: "Download" })}
        </Button>
        {!!versions.data?.length && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVersionsOpen(true)}
          >
            <History className="size-4" />
            {t.formatMessage({ defaultMessage: "Versions" })}
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                size="sm"
                disabled={
                  blocked ||
                  !changed ||
                  publish.isPending ||
                  saveStatus === "conflict"
                }
                onClick={() => void publishDraft()}
              >
                {publish.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {t.formatMessage({ defaultMessage: "Publish" })}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {blocked
              ? t.formatMessage({
                  defaultMessage:
                    "Fix the format findings first: the rest of StoryToRole reads this format.",
                })
              : changed
                ? t.formatMessage({
                    defaultMessage:
                      "Publishes this draft as the version resumes and fit checks read.",
                  })
                : t.formatMessage({
                    defaultMessage: "Nothing changed since the last version.",
                  })}
          </TooltipContent>
        </Tooltip>
      </div>
      <VersionsDialog open={versionsOpen} onOpenChange={setVersionsOpen} />
    </div>
  );
}
