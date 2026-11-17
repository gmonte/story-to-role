"use client";

import { useState, type ReactNode } from "react";

import { useMutation } from "@tanstack/react-query";

import type { OutputLanguage } from "@repo/api/domains/documents/schemas/document";
import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
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
import { Label } from "@repo/web/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@repo/web/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/web/components/ui/select";
import { toast } from "@repo/web/components/ui/sonner";

import { CreditCost } from "~/domains/credits/components/credit-cost";
import { useCredits } from "~/domains/credits/hooks/use-credits";
import { useTRPC } from "~/tools/trpc/client";

import { useDocumentLabels } from "../hooks/use-document-labels";
import { useRefreshDocuments } from "../hooks/use-opening-documents";

const languages: OutputLanguage[] = ["en-US", "pt-BR"];

/**
 * Asking for a version in another language (resume spec, "Output
 * language"): adapt it from an existing version (the default; same content
 * rewritten, keeping the evidence) or generate it from scratch. With a
 * target, it recreates that version from another one instead.
 */
export function AdaptVersionDialog({
  versions,
  target,
  scratch,
  trigger,
}: {
  versions: VersionView[];
  /** Recreate this version from another one. */
  target?: VersionView;
  /** The generation dialog, offered as the other choice. */
  scratch?: ReactNode;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {/* Mounted per opening: choices start fresh from the versions. */}
        <AdaptForm
          versions={versions}
          target={target}
          scratch={scratch}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AdaptForm({
  versions,
  target,
  scratch,
  onDone,
}: {
  versions: VersionView[];
  target?: VersionView;
  scratch?: ReactNode;
  onDone: () => void;
}) {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  // An adaptation is always into another language.
  const sources = versions.filter(
    (version) =>
      version.id !== target?.id && version.language !== target?.language
  );
  const credits = useCredits();
  const [mode, setMode] = useState<"adapt" | "scratch">("adapt");
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const source = sources.find((version) => version.id === sourceId);
  const choices = languages.filter((option) => option !== source?.language);
  const [chosen, setChosen] = useState<OutputLanguage | null>(null);
  const language =
    target?.language ??
    (chosen && choices.includes(chosen)
      ? chosen
      : (choices.find(
          (option) => !versions.some((version) => version.language === option)
        ) ?? choices[0]));
  const adapt = useMutation(
    trpc.adaptation.adapt.mutationOptions({
      onSuccess: async () => {
        await refresh();
        onDone();
      },
      onError: (error) => toast.error(error.message),
    })
  );
  const repeats =
    !target && versions.some((version) => version.language === language);

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {target
            ? t.formatMessage(
                { defaultMessage: "Recreate {version}" },
                { version: labels.version(target) }
              )
            : t.formatMessage({ defaultMessage: "New version" })}
        </DialogTitle>
        <DialogDescription>
          {target
            ? t.formatMessage({
                defaultMessage:
                  "Its content is replaced by an adaptation of another version. Edits made only here are not carried over; undo brings them back.",
              })
            : t.formatMessage({
                defaultMessage:
                  "Adapting keeps the same content, and the profile passages behind it, rewritten for the new language. It adds no facts.",
              })}
        </DialogDescription>
      </DialogHeader>

      {!target && scratch && (
        <RadioGroup
          value={mode}
          onValueChange={(value) => setMode(value as "adapt" | "scratch")}
          className="grid gap-2"
        >
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="adapt" />
            {t.formatMessage({ defaultMessage: "Adapt from a version" })}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="scratch" />
            {t.formatMessage({
              defaultMessage:
                "Generate a new version from your published profile",
            })}
          </label>
        </RadioGroup>
      )}

      {mode === "adapt" && (
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>{t.formatMessage({ defaultMessage: "Adapt from" })}</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sources.map((version) => (
                  <SelectItem key={version.id} value={version.id}>
                    {labels.version(version)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!target && (
            <div className="grid gap-1.5">
              <Label>
                {t.formatMessage({ defaultMessage: "Output language" })}
              </Label>
              <Select
                value={language}
                onValueChange={(value) => setChosen(value as OutputLanguage)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {choices.map((option) => (
                    <SelectItem key={option} value={option}>
                      {labels.language(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {repeats && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
              {t.formatMessage(
                {
                  defaultMessage:
                    "This resume already has a version in {language}. Do you really want another one?",
                },
                { language: labels.language(language) }
              )}
            </p>
          )}
        </div>
      )}

      <DialogFooter className="items-center">
        {mode === "scratch" ? (
          scratch
        ) : (
          <>
            <CreditCost credits={credits.data?.estimates.adaptation} />
            <Button
              disabled={adapt.isPending || !source}
              onClick={() =>
                adapt.mutate({
                  versionId: sourceId,
                  language,
                  targetVersionId: target?.id,
                })
              }
            >
              {target
                ? t.formatMessage({ defaultMessage: "Recreate" })
                : t.formatMessage({ defaultMessage: "Adapt" })}
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}
