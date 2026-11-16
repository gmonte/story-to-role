"use client";

import { useState } from "react";

import { useClerk, useUser } from "@clerk/nextjs";
import { useMutation } from "@tanstack/react-query";
import { Download, Trash2 } from "lucide-react";

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
import { Input } from "@repo/web/components/ui/input";
import { Label } from "@repo/web/components/ui/label";
import { toast } from "@repo/web/components/ui/sonner";
import { privacySettings } from "@repo/common/settings/privacy-settings";

import { useCredits } from "~/domains/credits/hooks/use-credits";
import { useTRPC } from "~/tools/trpc/client";

/**
 * Privacy spec, "Export and deletion": the whole account as a ZIP, and
 * deleting it at once and for good.
 */
export function PrivacyAndData() {
  const t = useTranslation();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 overflow-y-auto p-6 text-sm">
      <section className="flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="font-medium">
          {t.formatMessage({ defaultMessage: "Download your data" })}
        </h2>
        <p className="text-muted-foreground">
          {t.formatMessage({
            defaultMessage:
              "A ZIP with everything StoryToRole holds for you: your career timeline and evidence, interviews, openings, applications, every version of your documents as JSON, their PDFs and the files you imported. Your own API key is not included.",
          })}
        </p>
        <Button asChild variant="outline" className="self-start">
          <a href="/api/account/export" download>
            <Download />
            {t.formatMessage({ defaultMessage: "Download my data" })}
          </a>
        </Button>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-red-500/40 p-4">
        <h2 className="font-medium">
          {t.formatMessage({ defaultMessage: "Delete your account" })}
        </h2>
        <p className="text-muted-foreground">
          {t.formatMessage(
            {
              defaultMessage:
                "Everything is deleted right away and can’t be recovered. The database’s recovery history keeps a copy for up to {hours, plural, one {# hour} other {# hours}}, with your career content unreadable, and then it’s gone. A subscription ends now. Stripe keeps only the invoices the law requires.",
            },
            { hours: privacySettings.databaseHistoryHours }
          )}
        </p>
        <DeleteAccountDialog />
      </section>
    </div>
  );
}

function DeleteAccountDialog() {
  const t = useTranslation();
  const trpc = useTRPC();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [email, setEmail] = useState("");
  const remove = useMutation(
    trpc.account.delete.mutationOptions({
      onSuccess: () => signOut({ redirectUrl: "/" }),
      onError: (error) => toast.error(error.message),
    })
  );
  const expected = user?.primaryEmailAddress?.emailAddress ?? "";
  // Credits go with the account: nothing is kept to give them back.
  const credits = useCredits().data?.available ?? 0;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive" className="self-start">
          <Trash2 />
          {t.formatMessage({ defaultMessage: "Delete my account" })}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t.formatMessage({
              defaultMessage: "Delete your account for good?",
            })}
          </DialogTitle>
          <DialogDescription>
            {t.formatMessage({
              defaultMessage:
                "Download your data first if you want to keep it. To confirm, type your email.",
            })}
          </DialogDescription>
        </DialogHeader>
        {credits > 0 && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-sm">
            {t.formatMessage(
              {
                defaultMessage:
                  "Your {credits, number} remaining credits are lost with the account, including any you bought. Signing up again doesn’t bring them back.",
              },
              { credits }
            )}
          </p>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="confirm-email">{expected}</Label>
          <Input
            id="confirm-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={
              remove.isPending ||
              email.trim().toLowerCase() !== expected.toLowerCase()
            }
            onClick={() => remove.mutate({ confirmEmail: email })}
          >
            {t.formatMessage({ defaultMessage: "Delete everything" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
