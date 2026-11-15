"use client";

import { useState, type FormEvent } from "react";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Input } from "@repo/web/components/ui/input";
import { Label } from "@repo/web/components/ui/label";
import { toast } from "@repo/web/components/ui/sonner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/web/components/ui/tabs";
import { Textarea } from "@repo/web/components/ui/textarea";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshOpenings } from "../hooks/use-opening";

/**
 * Adds an opening: paste its description, give its link (read by code in an
 * isolated task), or name a company to approach with no vacancy open.
 */
export function NewOpeningForm() {
  const t = useTranslation();
  const trpc = useTRPC();
  const router = useRouter();
  const [description, setDescription] = useState("");

  const refresh = useRefreshOpenings();
  const onSuccess = async ({ openingId }: { openingId: string }) => {
    await refresh();
    router.push(`/app/openings/${openingId}`);
  };
  const onError = (error: { message: string }) => toast.error(error.message);
  const fromText = useMutation(
    trpc.openings.addFromText.mutationOptions({ onSuccess, onError })
  );
  const fromLink = useMutation(
    trpc.openings.addFromLink.mutationOptions({ onSuccess, onError })
  );
  const unsolicited = useMutation(
    trpc.openings.addUnsolicited.mutationOptions({ onSuccess, onError })
  );
  const pending =
    fromText.isPending || fromLink.isPending || unsolicited.isPending;

  const field = (form: FormData, name: string) => {
    const value = form.get(name);
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col justify-center gap-6 p-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          {t.formatMessage({ defaultMessage: "Add an opening" })}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t.formatMessage({
            defaultMessage:
              "You'll see right away whether it fits your career: a hint, never a gate.",
          })}
        </p>
      </div>
      <Tabs defaultValue="paste">
        <TabsList>
          <TabsTrigger value="paste">
            {t.formatMessage({ defaultMessage: "Paste" })}
          </TabsTrigger>
          <TabsTrigger value="link">
            {t.formatMessage({ defaultMessage: "Link" })}
          </TabsTrigger>
          <TabsTrigger value="unsolicited">
            {t.formatMessage({ defaultMessage: "No vacancy" })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="paste" className="flex flex-col gap-3 pt-2">
          <Textarea
            rows={12}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t.formatMessage({
              defaultMessage: "Paste the opening's description",
            })}
          />
          <Button
            disabled={pending || description.trim().length < 200}
            onClick={() => fromText.mutate({ description: description.trim() })}
          >
            {t.formatMessage({ defaultMessage: "Analyze" })}
          </Button>
        </TabsContent>

        <TabsContent value="link" className="pt-2">
          <form
            className="flex flex-col gap-3"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const url = field(new FormData(event.currentTarget), "url");
              if (url) fromLink.mutate({ url });
            }}
          >
            <Input name="url" type="url" required placeholder="https://" />
            <p className="text-muted-foreground text-xs">
              {t.formatMessage({
                defaultMessage:
                  "We read the page without logging in. If it needs a login or only works in the browser, we'll ask you to paste the text.",
              })}
            </p>
            <Button type="submit" disabled={pending}>
              {t.formatMessage({ defaultMessage: "Analyze" })}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="unsolicited" className="pt-2">
          <form
            className="flex flex-col gap-3"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const company = field(form, "company");
              if (!company) return;
              unsolicited.mutate({
                company,
                role: field(form, "role"),
                notes: field(form, "notes"),
                link: field(form, "link"),
              });
            }}
          >
            {[
              {
                name: "company",
                label: t.formatMessage({ defaultMessage: "Company" }),
                required: true,
              },
              {
                name: "role",
                label: t.formatMessage({
                  defaultMessage: "Role or area (optional)",
                }),
              },
              {
                name: "link",
                label: t.formatMessage({ defaultMessage: "Link (optional)" }),
                type: "url",
              },
            ].map((input) => (
              <div key={input.name} className="grid gap-1.5">
                <Label htmlFor={input.name}>{input.label}</Label>
                <Input
                  id={input.name}
                  name={input.name}
                  type={input.type}
                  required={input.required}
                />
              </div>
            ))}
            <div className="grid gap-1.5">
              <Label htmlFor="notes">
                {t.formatMessage({ defaultMessage: "Notes (optional)" })}
              </Label>
              <Textarea id="notes" name="notes" rows={3} />
            </div>
            <Button type="submit" disabled={pending}>
              {t.formatMessage({ defaultMessage: "Add" })}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
