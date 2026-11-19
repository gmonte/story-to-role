"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ApplicationDetail } from "@repo/api/domains/applications/schemas/tracker";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/web/components/ui/dialog";
import { Label } from "@repo/web/components/ui/label";
import { toast } from "@repo/web/components/ui/sonner";
import { Textarea } from "@repo/web/components/ui/textarea";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshTracker } from "../hooks/use-tracker";

/**
 * Giving up (tracker spec) is the withdrawn status: this dialog asks for
 * the user's own reason, optional, and can add it as a discard rule.
 * Confirming saves the status, the reason and the rule; cancelling changes
 * nothing.
 */
export function WithdrawDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: ApplicationDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshTracker();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState(detail.declineReason ?? "");
  const [asRule, setAsRule] = useState(false);
  const setStatus = useMutation(trpc.tracker.setStatus.mutationOptions());
  const save = useMutation(trpc.tracker.updateDetails.mutationOptions());
  const addRule = useMutation(
    trpc.tracker.addDeclineReasonAsRule.mutationOptions()
  );
  const pending = setStatus.isPending || save.isPending || addRule.isPending;
  const trimmed = reason.trim();

  const confirm = async () => {
    try {
      if (detail.status !== "withdrawn") {
        await setStatus.mutateAsync({
          applicationId: detail.id,
          status: "withdrawn",
        });
      }
      await save.mutateAsync({
        applicationId: detail.id,
        declineReason: trimmed || null,
      });
      if (asRule && trimmed) {
        await addRule.mutateAsync({ applicationId: detail.id });
        void queryClient.invalidateQueries({
          queryKey: trpc.profile.pathKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.openings.pathKey(),
        });
        toast.success(
          t.formatMessage({
            defaultMessage:
              "Added to your discard rules; the next fit checks count it.",
          })
        );
      }
      await refresh();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      await refresh();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t.formatMessage({ defaultMessage: "Give up this opening" })}
          </DialogTitle>
          <DialogDescription>
            {t.formatMessage({
              defaultMessage:
                "The application becomes withdrawn. Your reason is optional and stays private.",
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="decline-reason">
            {t.formatMessage({
              defaultMessage: "Why you gave up (your reason)",
            })}
          </Label>
          <Textarea
            id="decline-reason"
            value={reason}
            maxLength={2000}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <Label className="items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={asRule && !!trimmed}
            disabled={!trimmed}
            onCheckedChange={(checked) => setAsRule(checked === true)}
          />
          {t.formatMessage({ defaultMessage: "Add as a discard rule" })}
        </Label>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t.formatMessage({ defaultMessage: "Cancel" })}
          </Button>
          <Button disabled={pending} onClick={() => void confirm()}>
            {t.formatMessage({ defaultMessage: "Confirm" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
