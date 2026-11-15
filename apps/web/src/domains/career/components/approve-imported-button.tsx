"use client";

import { useMutation } from "@tanstack/react-query";
import { CheckCheck } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshCareer } from "../hooks/use-career-queries";

/**
 * The import shortcut: approves, with every extracted fact, each imported
 * position that has no conflict left. The others wait for the user.
 */
export function ApproveImportedButton() {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshCareer();
  const approve = useMutation(
    trpc.interview.approveImportedPositions.mutationOptions({
      onSuccess: async ({ approved }) => {
        await refresh();
        toast.success(
          t.formatMessage(
            {
              defaultMessage:
                "{count, plural, =0 {No position was ready to approve.} one {# position approved.} other {# positions approved.}}",
            },
            { count: approved }
          )
        );
      },
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={approve.isPending}
      onClick={() => approve.mutate({})}
    >
      <CheckCheck />
      {t.formatMessage({
        defaultMessage: "Approve imported positions without conflicts",
      })}
    </Button>
  );
}
