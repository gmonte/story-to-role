"use client";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/web/components/ui/dialog";

/**
 * Asks before a document with open findings leaves (resume spec, "Document
 * workspace": findings point out, never block): the user can fix them
 * first, or go on anyway.
 */
export function WarningsDialog({
  open,
  onOpenChange,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const t = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t.formatMessage({
              defaultMessage: "The document has open findings",
            })}
          </DialogTitle>
          <DialogDescription>
            {t.formatMessage({
              defaultMessage:
                "The checks found something to look at: a line not in your profile, a figure it doesn't mark as measured, a name it writes another way. You can fix it first, or go on anyway.",
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.formatMessage({ defaultMessage: "Go back" })}
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
