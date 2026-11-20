"use client";

import { useState, type ReactNode } from "react";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import type {
  OutputLanguage,
  WritingLevel,
} from "@repo/api/domains/documents/schemas/document";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/web/components/ui/select";
import { toast } from "@repo/web/components/ui/sonner";

import { CreditCost } from "~/domains/credits/components/credit-cost";
import { useCredits } from "~/domains/credits/hooks/use-credits";
import { linkedinCredits } from "~/domains/credits/utils/credit-costs";
import { useOpeningLabels } from "~/domains/openings/hooks/use-opening-labels";
import { useTRPC } from "~/tools/trpc/client";

import { useDocumentLabels } from "../hooks/use-document-labels";
import { useDocumentSettings } from "../hooks/use-document-settings";
import { useRefreshDocuments } from "../hooks/use-opening-documents";
import { PublishProfileNotice } from "./document-settings";

const languages: OutputLanguage[] = ["en-US", "pt-BR"];
const tones: Tone[] = ["your_style", "formal", "direct", "warm", "technical"];

/**
 * The Goal step of the LinkedIn text (resume spec, "LinkedIn", "Step by
 * step"): the language, writing level and tone, then Start step by step
 * (free: a version with what code prints, written section by section) or
 * the shortcut Generate everything at once, which in a language the text
 * has makes a new snapshot of that version.
 */
export function LinkedinDialog({
  defaultLanguage,
  defaultTone = "your_style",
  trigger,
}: {
  defaultLanguage?: OutputLanguage;
  defaultTone?: Tone;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {/* Mounted per opening: the form starts fresh each time. */}
        <LinkedinForm
          defaultLanguage={defaultLanguage}
          defaultTone={defaultTone}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function LinkedinForm({
  defaultLanguage,
  defaultTone,
  onDone,
}: {
  defaultLanguage?: OutputLanguage;
  defaultTone: Tone;
  onDone: () => void;
}) {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const openingLabels = useOpeningLabels();
  const trpc = useTRPC();
  const router = useRouter();
  const refresh = useRefreshDocuments();
  const credits = useCredits();
  const [language, setLanguage] = useState<OutputLanguage>(
    defaultLanguage ?? (t.locale === "pt-BR" ? "pt-BR" : "en-US")
  );
  const [writingLevel, setWritingLevel] = useState<WritingLevel>("standard");
  const [tone, setTone] = useState<Tone>(defaultTone);
  // Only whether the profile is published: a LinkedIn text takes no
  // document settings (every position, 3 to 4 bullets, no page limit).
  const documentSettings = useDocumentSettings(true);
  const done = async (versionId?: string) => {
    await refresh();
    onDone();
    router.push(
      versionId ? `/app/linkedin?version=${versionId}` : "/app/linkedin"
    );
  };
  const generate = useMutation(
    trpc.linkedin.generate.mutationOptions({
      onSuccess: () => done(),
      onError: (error) => toast.error(error.message),
    })
  );
  const start = useMutation(
    trpc.linkedin.start.mutationOptions({
      onSuccess: ({ versionId }) => done(versionId),
      onError: (error) => toast.error(error.message),
    })
  );
  const pending = generate.isPending || start.isPending;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t.formatMessage({ defaultMessage: "LinkedIn text" })}
        </DialogTitle>
        <DialogDescription>
          {t.formatMessage({
            defaultMessage:
              "Your headline options, About, experiences, projects, education, certifications and languages, written from your published profile, one step at a time. You copy what you approve: nothing is changed on LinkedIn.",
          })}
        </DialogDescription>
      </DialogHeader>
      {documentSettings.unpublished && <PublishProfileNotice />}
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label>
            {t.formatMessage({ defaultMessage: "Output language" })}
          </Label>
          <Select
            value={language}
            onValueChange={(value) => setLanguage(value as OutputLanguage)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languages.map((option) => (
                <SelectItem key={option} value={option}>
                  {labels.language(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={writingLevel}
            onValueChange={(value) => setWritingLevel(value as WritingLevel)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["standard", "maximum"] as const).map((option) => (
                <SelectItem key={option} value={option}>
                  {labels.writingLevel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={tone}
            onValueChange={(value) => setTone(value as Tone)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tones.map((option) => (
                <SelectItem key={option} value={option}>
                  {openingLabels.tone(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 sm:mr-auto">
          <Button
            variant="ghost"
            disabled={pending || documentSettings.unpublished}
            onClick={() => generate.mutate({ language, writingLevel, tone })}
          >
            {t.formatMessage({ defaultMessage: "Generate everything at once" })}
          </Button>
          <CreditCost
            credits={linkedinCredits(credits.data?.estimates, writingLevel)}
          />
        </div>
        <Button
          disabled={pending || documentSettings.unpublished}
          onClick={() => start.mutate({ language, writingLevel, tone })}
        >
          {t.formatMessage({ defaultMessage: "Start step by step" })}
        </Button>
      </DialogFooter>
    </>
  );
}
