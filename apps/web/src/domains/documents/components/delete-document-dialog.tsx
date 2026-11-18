"use client";

import { useState, type ReactNode } from "react";

import { useMutation } from "@tanstack/react-query";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/web/components/ui/dialog";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshDocuments } from "../hooks/use-opening-documents";

/**
 * Deletes a whole library document (resume spec, "Versions and snapshots"):
 * every version, its change history and its PDFs. Final, so it confirms.
 * Library documents are never sent with an application, so there is no
 * "sent version" to warn about here.
 */
export function DeleteDocumentDialog({
  documentId,
  trigger,
  onDeleted,
}: {
  documentId: string;
  trigger: ReactNode;
  onDeleted?: () => void;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const [open, setOpen] = useState(false);
  const remove = useMutation(
    trpc.library.deleteDocument.mutationOptions({
      onSuccess: async () => {
        setOpen(false);
        onDeleted?.();
        await refresh();
      },
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t.formatMessage({ defaultMessage: "Delete this document?" })}
          </DialogTitle>
          <DialogDescription>
            {t.formatMessage({
              defaultMessage:
                "All its versions, change history and PDFs are deleted. This can't be undone.",
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">
              {t.formatMessage({ defaultMessage: "Cancel" })}
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate({ documentId })}
          >
            {t.formatMessage({ defaultMessage: "Delete document" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
