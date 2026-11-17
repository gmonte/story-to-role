"use client";

import { useState, type ReactNode } from "react";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import type {
  OutputLanguage,
  ReviewDepth,
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
import { Input } from "@repo/web/components/ui/input";
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
import { resumeCredits } from "~/domains/credits/utils/credit-costs";
import { useOpeningLabels } from "~/domains/openings/hooks/use-opening-labels";
import { useTRPC } from "~/tools/trpc/client";

import { useDocumentLabels } from "../hooks/use-document-labels";
import { useDocumentSettings } from "../hooks/use-document-settings";
import { useRefreshDocuments } from "../hooks/use-opening-documents";
import { DocumentSettings, PublishProfileNotice } from "./document-settings";

const languages: OutputLanguage[] = ["en-US", "pt-BR"];
const tones: Tone[] = ["your_style", "formal", "direct", "warm", "technical"];

/**
 * A library resume (resume spec, "Openings and library documents"): from
 * the published profile, for a focus such as "React Native" or "General",
 * with no company behind it. With a version, it generates that one again.
 */
export function LibraryResumeDialog({
  versionId,
  defaultTone = "your_style",
  trigger,
}: {
  versionId?: string;
  /** The tone of the version's last generation, when generating again. */
  defaultTone?: Tone;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {/* Mounted per opening: the form starts fresh each time. */}
        <LibraryResumeForm
          versionId={versionId}
          defaultTone={defaultTone}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function LibraryResumeForm({
  versionId,
  defaultTone,
  onDone,
}: {
  versionId?: string;
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
  const [focus, setFocus] = useState("");
  // The interface's language is the likeliest one for a first resume.
  const [language, setLanguage] = useState<OutputLanguage>(
    t.locale === "pt-BR" ? "pt-BR" : "en-US"
  );
  const [reviewDepth, setReviewDepth] = useState<ReviewDepth>("quick");
  const [writingLevel, setWritingLevel] = useState<WritingLevel>("standard");
  const [tone, setTone] = useState<Tone>(defaultTone);
  // Mounted while the dialog is open: its defaults are read each time.
  const documentSettings = useDocumentSettings(true);
  const generate = useMutation(
    trpc.library.generateResume.mutationOptions({
      onSuccess: async ({ documentId }) => {
        await refresh();
        onDone();
        if (!versionId) router.push(`/app/library/${documentId}`);
      },
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {versionId
            ? t.formatMessage({ defaultMessage: "Generate again" })
            : t.formatMessage({ defaultMessage: "New resume" })}
        </DialogTitle>
        <DialogDescription>
          {t.formatMessage({
            defaultMessage:
              "A resume with no company behind it, from your published profile, titled by its focus.",
          })}
        </DialogDescription>
      </DialogHeader>
      {documentSettings.unpublished && <PublishProfileNotice />}
      <div className="grid gap-4">
        {!versionId && (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="library-focus">
                {t.formatMessage({ defaultMessage: "Focus" })}
              </Label>
              <Input
                id="library-focus"
                value={focus}
                maxLength={80}
                onChange={(event) => setFocus(event.target.value)}
                placeholder={t.formatMessage({
                  defaultMessage: "React Native, Frontend, General…",
                })}
              />
            </div>
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
          </>
        )}
        <div className="grid grid-cols-3 gap-2">
          <Select
            value={reviewDepth}
            onValueChange={(value) => setReviewDepth(value as ReviewDepth)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["quick", "thorough"] as const).map((option) => (
                <SelectItem key={option} value={option}>
                  {labels.reviewDepth(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          credits={resumeCredits(credits.data?.estimates, {
            reviewDepth,
            writingLevel,
          })}
        />
        <Button
          disabled={
            generate.isPending ||
            (!versionId && !focus.trim()) ||
            documentSettings.unpublished
          }
          onClick={() =>
            generate.mutate({
              focus: versionId ? undefined : focus,
              versionId,
              language,
              reviewDepth,
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
