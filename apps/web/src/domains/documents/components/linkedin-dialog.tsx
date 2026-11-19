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
import { DocumentSettings, PublishProfileNotice } from "./document-settings";

const languages: OutputLanguage[] = ["en-US", "pt-BR"];
const tones: Tone[] = ["your_style", "formal", "direct", "warm", "technical"];

/**
 * Generates the LinkedIn text (resume spec, "LinkedIn") from the published
 * profile, in a language: the first time it creates the document, and
 * again in a language it has makes a new change of that version.
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
  const documentSettings = useDocumentSettings(true);
  const generate = useMutation(
    trpc.linkedin.generate.mutationOptions({
      onSuccess: async () => {
        await refresh();
        onDone();
        router.push("/app/linkedin");
      },
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t.formatMessage({ defaultMessage: "LinkedIn text" })}
        </DialogTitle>
        <DialogDescription>
          {t.formatMessage({
            defaultMessage:
              "Your headline options, About, experiences, projects, education, certifications and languages, written from your published profile. You copy what you approve: nothing is changed on LinkedIn.",
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
        <DocumentSettings
          value={documentSettings.value}
          onChange={documentSettings.onChange}
        />
      </div>
      <DialogFooter className="items-center">
        <CreditCost
          credits={linkedinCredits(credits.data?.estimates, writingLevel)}
        />
        <Button
          disabled={
            generate.isPending ||
            documentSettings.unpublished ||
            documentSettings.invalid
          }
          onClick={() =>
            generate.mutate({
              language,
              writingLevel,
              tone,
              settings: documentSettings.settings,
            })
          }
        >
          {t.formatMessage({ defaultMessage: "Generate" })}
        </Button>
      </DialogFooter>
    </>
  );
}
