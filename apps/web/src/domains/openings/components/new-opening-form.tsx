"use client";

import { useState, type FormEvent } from "react";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
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
import { cn } from "@repo/web/lib/utils";

import { CreditCost } from "~/domains/credits/components/credit-cost";
import { useCredits } from "~/domains/credits/hooks/use-credits";
import { useTRPC } from "~/tools/trpc/client";

import { useRefreshOpenings } from "../hooks/use-opening";

/**
 * Adds an opening: paste its description, give its link (read by code in an
 * isolated task), or name a company to approach with no vacancy open.
 * “Analyze now” is on by default; off, or without credits for a fit check,
 * the user names the company and title and the opening is registered not
 * analyzed, to analyze later (resume spec, “Analyze now, or later”).
 */
export function NewOpeningForm({
  embedded = false,
}: {
  // Inside another page (the guided start), which brings its own heading.
  embedded?: boolean;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const credits = useCredits();
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [analyzeNow, setAnalyzeNow] = useState(true);
  // The company and title a registered opening is named by (paste, link).
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");

  const canAnalyze =
    !credits.data || credits.data.available >= credits.data.estimates.fitCheck;
  const analyzing = analyzeNow && canAnalyze;
  const named = !!company.trim() && !!title.trim();

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
  const register = useMutation(
    trpc.openings.register.mutationOptions({ onSuccess, onError })
  );
  const pending =
    fromText.isPending ||
    fromLink.isPending ||
    unsolicited.isPending ||
    register.isPending;

  const field = (form: FormData, name: string) => {
    const value = form.get(name);
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };

  const nameFields = !analyzing && (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="opening-company">
          {t.formatMessage({ defaultMessage: "Company" })}
        </Label>
        <Input
          id="opening-company"
          required
          maxLength={200}
          value={company}
          onChange={(event) => setCompany(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="opening-title">
          {t.formatMessage({ defaultMessage: "Title" })}
        </Label>
        <Input
          id="opening-title"
          required
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
    </div>
  );
  const cost = analyzing && (
    <CreditCost credits={credits.data?.estimates.fitCheck} />
  );
  const submitLabel = analyzing
    ? t.formatMessage({ defaultMessage: "Analyze" })
    : t.formatMessage({ defaultMessage: "Add without analysis" });

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-6",
        !embedded && "mx-auto h-full max-w-2xl justify-center p-6"
      )}
    >
      {!embedded && (
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
      )}

      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={analyzing}
            disabled={!canAnalyze}
            onCheckedChange={(checked) => setAnalyzeNow(checked === true)}
          />
          {t.formatMessage({ defaultMessage: "Analyze now" })}
        </label>
        <p className="text-muted-foreground text-xs">
          {!canAnalyze
            ? t.formatMessage({
                defaultMessage:
                  "You don’t have credits for an analysis now. Name the company and title to add it; you can analyze it later.",
              })
            : analyzing
              ? t.formatMessage({
                  defaultMessage:
                    "The fit check reads the opening against your profile.",
                })
              : t.formatMessage({
                  defaultMessage:
                    "No credits are spent. You can apply to it and track it, and analyze it later from its page.",
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
          {nameFields}
          {/* A long description scrolls inside the box instead of growing
              past the page. */}
          <Textarea
            rows={12}
            className="max-h-[50vh] overflow-y-auto"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={
              analyzing
                ? t.formatMessage({
                    defaultMessage: "Paste the opening's description",
                  })
                : t.formatMessage({
                    defaultMessage:
                      "Paste the opening's description (optional)",
                  })
            }
          />
          <Button
            disabled={
              pending || (analyzing ? description.trim().length < 200 : !named)
            }
            onClick={() =>
              analyzing
                ? fromText.mutate({ description: description.trim() })
                : register.mutate({
                    kind: "posted",
                    company: company.trim(),
                    title: title.trim(),
                    description: description.trim() || undefined,
                  })
            }
          >
            {submitLabel}
          </Button>
          {cost}
        </TabsContent>

        <TabsContent value="link" className="pt-2">
          <form
            className="flex flex-col gap-3"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const url = field(new FormData(event.currentTarget), "url");
              if (analyzing) {
                if (url) fromLink.mutate({ url });
              } else if (named) {
                register.mutate({
                  kind: "posted",
                  company: company.trim(),
                  title: title.trim(),
                  link: url,
                });
              }
            }}
          >
            {nameFields}
            <Input
              name="url"
              type="url"
              required={analyzing}
              placeholder="https://"
              aria-label={t.formatMessage({ defaultMessage: "Link" })}
            />
            {analyzing && (
              <p className="text-muted-foreground text-xs">
                {t.formatMessage({
                  defaultMessage:
                    "We read the page without logging in. If it needs a login or only works in the browser, we'll ask you to paste the text.",
                })}
              </p>
            )}
            <Button type="submit" disabled={pending}>
              {submitLabel}
            </Button>
            {cost}
          </form>
        </TabsContent>

        <TabsContent value="unsolicited" className="pt-2">
          <form
            className="flex flex-col gap-3"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const name = field(form, "company");
              if (!name) return;
              const fields = {
                role: field(form, "role"),
                notes: field(form, "notes"),
                link: field(form, "link"),
              };
              if (analyzing) unsolicited.mutate({ company: name, ...fields });
              else
                register.mutate({
                  kind: "unsolicited",
                  company: name,
                  title: fields.role,
                  notes: fields.notes,
                  link: fields.link,
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
              {analyzing
                ? t.formatMessage({ defaultMessage: "Add" })
                : t.formatMessage({ defaultMessage: "Add without analysis" })}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
