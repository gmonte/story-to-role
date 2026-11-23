"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

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
} from "@repo/web/components/ui/dialog";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshOpenings } from "../hooks/use-opening";

/**
 * Deletes an opening and everything that is its: the application, the
 * documents written for it (every version and PDF), the answers and the
 * research. Final, so it confirms; the workspace opens its start after.
 */
export function DeleteOpeningDialog({
  openingId,
  open,
  onOpenChange,
}: {
  openingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const router = useRouter();
  const refresh = useRefreshOpenings();
  const remove = useMutation(
    trpc.openings.deleteOpening.mutationOptions({
      onSuccess: async () => {
        onOpenChange(false);
        router.replace("/app");
        await refresh();
      },
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t.formatMessage({ defaultMessage: "Delete this opening?" })}
          </DialogTitle>
          <DialogDescription>
            {t.formatMessage({
              defaultMessage:
                "The opening, its application and every document written for it (all versions and PDFs) are deleted, with your answers and the company research. This can't be undone.",
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
            onClick={() => remove.mutate({ openingId })}
          >
            {t.formatMessage({ defaultMessage: "Delete opening" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
