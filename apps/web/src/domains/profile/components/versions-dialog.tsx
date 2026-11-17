"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTranslation } from "@repo/intl/use-translation";
import { diffLines } from "@repo/api/domains/profile/truth/diff";
import { Button } from "@repo/web/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/web/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/web/components/ui/select";
import { toast } from "@repo/web/components/ui/sonner";
import { cn } from "@repo/web/lib/utils";

import { useTRPC } from "~/tools/trpc/client";

import { useProfileEditor } from "./profile-editor-context";

// The diff's gutter, like a terminal's; not words to translate.
const changePrefix = { added: "+ ", removed: "− ", same: "  " };
const blankLine = " ";

const draftKey = "draft";
const noneKey = "none";

/**
 * The published versions (profile spec, "Validate and publish"): read any
 * of them, compare it with the draft or another version, and restore it
 * into the draft.
 */
export function VersionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { markdown, saveNow, resetTo } = useProfileEditor();
  const versions = useQuery({
    ...trpc.profile.versions.queryOptions({}),
    enabled: open,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [compareWith, setCompareWith] = useState<string>(draftKey);
  const versionId = selected ?? versions.data?.[0]?.id ?? null;
  const version = useQuery({
    ...trpc.profile.version.queryOptions({ profileVersionId: versionId ?? "" }),
    enabled: open && !!versionId,
  });
  const other = useQuery({
    ...trpc.profile.version.queryOptions({ profileVersionId: compareWith }),
    enabled: open && compareWith !== draftKey && compareWith !== noneKey,
  });
  const restore = useMutation(trpc.profile.restoreVersion.mutationOptions());

  const otherText =
    compareWith === draftKey
      ? markdown()
      : compareWith === noneKey
        ? null
        : other.data?.markdown;

  async function restoreVersion() {
    if (!version.data) return;
    const revision = await saveNow();
    if (revision === null) {
      toast.error(
        t.formatMessage({
          defaultMessage: "Save the profile before restoring a version.",
        })
      );
      return;
    }
    try {
      const result = await restore.mutateAsync({
        profileVersionId: version.data.id,
        baseRevision: revision,
      });
      resetTo({ markdown: version.data.markdown, revision: result.revision });
      await queryClient.invalidateQueries({ queryKey: trpc.profile.pathKey() });
      onOpenChange(false);
      toast.success(
        t.formatMessage(
          {
            defaultMessage:
              "Version {number, number} is now the draft. Undo by restoring another.",
          },
          { number: version.data.number }
        )
      );
    } catch {
      toast.error(
        t.formatMessage({ defaultMessage: "The version couldn't be restored." })
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {t.formatMessage({ defaultMessage: "Published versions" })}
          </DialogTitle>
          <DialogDescription>
            {t.formatMessage({
              defaultMessage:
                "Every published version is kept. Compare one with the draft or another version, or restore it into the draft.",
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-4 sm:grid-cols-[12rem_1fr]">
          <ul className="max-h-[60vh] space-y-0.5 overflow-y-auto">
            {versions.data?.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelected(item.id)}
                  className={cn(
                    "hover:bg-muted w-full rounded px-2 py-1.5 text-left text-sm",
                    item.id === versionId && "bg-muted font-medium"
                  )}
                >
                  {t.formatMessage(
                    { defaultMessage: "Version {number, number}" },
                    { number: item.number }
                  )}
                  <span className="text-muted-foreground block text-xs">
                    {t.formatDate(item.publishedAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs">
                {t.formatMessage({ defaultMessage: "Compare with" })}
              </span>
              <Select value={compareWith} onValueChange={setCompareWith}>
                <SelectTrigger size="sm" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={draftKey}>
                    {t.formatMessage({ defaultMessage: "The draft" })}
                  </SelectItem>
                  <SelectItem value={noneKey}>
                    {t.formatMessage({ defaultMessage: "Nothing (read it)" })}
                  </SelectItem>
                  {versions.data
                    ?.filter((item) => item.id !== versionId)
                    .map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {t.formatMessage(
                          { defaultMessage: "Version {number, number}" },
                          { number: item.number }
                        )}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={!version.data || restore.isPending}
                onClick={() => void restoreVersion()}
              >
                {t.formatMessage({ defaultMessage: "Restore into the draft" })}
              </Button>
            </div>
            <pre className="bg-muted/40 max-h-[55vh] overflow-auto rounded border p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {version.data &&
                (otherText === null || otherText === undefined
                  ? version.data.markdown
                  : diffLines(version.data.markdown, otherText).map(
                      (change, index) => (
                        <div
                          key={index}
                          className={cn(
                            change.type === "added" &&
                              "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                            change.type === "removed" &&
                              "bg-red-500/15 text-red-700 line-through dark:text-red-300"
                          )}
                        >
                          {changePrefix[change.type]}
                          {change.text || blankLine}
                        </div>
                      )
                    ))}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
