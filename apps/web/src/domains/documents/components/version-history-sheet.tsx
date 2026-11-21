"use client";

import { useState } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/web/components/ui/sheet";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useDocumentLabels } from "../hooks/use-document-labels";
import { useRefreshDocuments } from "../hooks/use-opening-documents";

/**
 * The change history (snapshots are "changes" in the interface): the top
 * one is official; restoring an old one adds it as a new change on top.
 */
export function VersionHistorySheet({ versionId }: { versionId: string }) {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const [open, setOpen] = useState(false);
  const history = useQuery({
    ...trpc.documents.history.queryOptions({ versionId }),
    enabled: open,
  });
  const restore = useMutation(
    trpc.documents.restore.mutationOptions({
      onSuccess: async () => {
        await refresh();
        setOpen(false);
      },
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="ghost">
          <History />
          {t.formatMessage({ defaultMessage: "Change history" })}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {t.formatMessage({ defaultMessage: "Change history" })}
          </SheetTitle>
          <SheetDescription>
            {t.formatMessage({
              defaultMessage:
                "The latest change is the official one. Restoring an older change adds it on top.",
            })}
          </SheetDescription>
        </SheetHeader>
        <ol className="flex flex-col gap-2 px-4">
          {history.data?.map((snapshot, index) => (
            <li
              key={snapshot.id}
              className="bg-card flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm"
            >
              <div className="flex flex-col">
                <span className="flex items-center gap-1.5">
                  {labels.origin(snapshot.origin)}
                  {index === 0 && (
                    <Badge variant="secondary">
                      {t.formatMessage({ defaultMessage: "Official" })}
                    </Badge>
                  )}
                  {snapshot.sentAt && (
                    <Badge variant="outline">
                      {t.formatMessage(
                        { defaultMessage: "Sent {date}" },
                        {
                          date: t.formatDate(snapshot.sentAt, {
                            dateStyle: "medium",
                          }),
                        }
                      )}
                    </Badge>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t.formatMessage(
                    { defaultMessage: "{author} · {date}" },
                    {
                      author:
                        snapshot.author === "ai"
                          ? t.formatMessage({
                              defaultMessage: "by StoryToRole",
                            })
                          : t.formatMessage({ defaultMessage: "by you" }),
                      date: t.formatDate(snapshot.createdAt, {
                        dateStyle: "short",
                        timeStyle: "short",
                      }),
                    }
                  )}
                </span>
              </div>
              {index > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate({ snapshotId: snapshot.id })}
                >
                  {t.formatMessage({ defaultMessage: "Restore this change" })}
                </Button>
              )}
            </li>
          ))}
        </ol>
      </SheetContent>
    </Sheet>
  );
}
