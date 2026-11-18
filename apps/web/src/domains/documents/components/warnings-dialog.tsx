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
 * Asks before a document with only warnings leaves (a real name that the
 * profile's public names replace in public documents): the user can fix it
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
              defaultMessage: "A real name is still in the text",
            })}
          </DialogTitle>
          <DialogDescription>
            {t.formatMessage({
              defaultMessage:
                "The coverage review found a name your profile writes another way in public documents. You can fix it first, or go on anyway.",
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
