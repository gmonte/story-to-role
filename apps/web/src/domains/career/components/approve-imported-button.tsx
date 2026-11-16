"use client";

import { useState } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCheck } from "lucide-react";

import type { PositionView } from "@repo/api/domains/career/schemas/timeline";
import type { ImportSkipReason } from "@repo/api/domains/interview/schemas/interview";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/web/components/ui/dialog";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshCareer } from "../hooks/use-career-queries";

const positionLabel = (position: PositionView | undefined) =>
  position ? [position.title, position.employer].join(" · ") : "";

/**
 * The import shortcut: approves, with every extracted fact, each imported
 * position the server finds ready. It says first exactly what it approves
 * (the server's own plan), that those facts weren't reviewed and can be
 * later, and which positions it leaves for the user and why.
 */
export function ApproveImportedButton({
  positions,
}: {
  positions: PositionView[];
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshCareer();
  const [open, setOpen] = useState(false);
  const plan = useQuery(trpc.interview.importedApprovalPlan.queryOptions({}));
  const approve = useMutation(
    trpc.interview.approveImportedPositions.mutationOptions({
      onSuccess: async ({ approved }) => {
        setOpen(false);
        await Promise.all([refresh(), plan.refetch()]);
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

  if (!plan.data || plan.data.ready.length === 0) return null;
  const { ready, skipped } = plan.data;
  const find = (positionId: string) =>
    positions.find((position) => position.id === positionId);
  const facts = ready.reduce((sum, item) => sum + item.facts, 0);
  const reasonLabel = (reason: ImportSkipReason) => {
    switch (reason) {
      case "conflict":
        return t.formatMessage({
          defaultMessage: "your files disagree on a detail",
        });
      case "talked":
        return t.formatMessage({ defaultMessage: "you talked about it" });
      case "nothing_extracted":
        return t.formatMessage({ defaultMessage: "nothing to approve yet" });
      case "not_from_file":
        return t.formatMessage({
          defaultMessage: "some facts didn't come from a file",
        });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <CheckCheck />
          {t.formatMessage({
            defaultMessage: "Approve imported positions without conflicts",
          })}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t.formatMessage(
              {
                defaultMessage:
                  "Approve {positions, plural, one {# position} other {# positions}} and {facts, plural, =0 {no facts} one {# fact} other {# facts}}?",
              },
              { positions: ready.length, facts }
            )}
          </DialogTitle>
          <DialogDescription>
            {t.formatMessage({
              defaultMessage:
                "These facts come straight from your files and haven't been reviewed. They become evidence the fit check and your resumes use. You can review and change any position later.",
            })}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1 text-sm">
          {ready.map((item) => (
            <li key={item.positionId} className="flex justify-between gap-2">
              <span className="truncate">
                {positionLabel(find(item.positionId))}
              </span>
              <span className="text-muted-foreground shrink-0">
                {t.formatMessage(
                  {
                    defaultMessage:
                      "{count, plural, =0 {no facts} one {# fact} other {# facts}}",
                  },
                  { count: item.facts }
                )}
              </span>
            </li>
          ))}
        </ul>
        {skipped.length > 0 && (
          <div className="flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-sm">
            <p className="font-medium">
              {t.formatMessage({
                defaultMessage: "Left for you to review:",
              })}
            </p>
            <ul className="flex flex-col gap-0.5">
              {skipped.map((item) => (
                <li key={item.positionId}>
                  {t.formatMessage(
                    { defaultMessage: "{position}: {reason}" },
                    {
                      position: positionLabel(find(item.positionId)),
                      reason: reasonLabel(item.reason),
                    }
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button
            disabled={approve.isPending}
            onClick={() => approve.mutate({})}
          >
            {t.formatMessage({ defaultMessage: "Approve without reviewing" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
