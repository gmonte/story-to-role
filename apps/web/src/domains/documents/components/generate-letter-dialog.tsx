"use client";

import { useState, type ReactNode } from "react";

import { useMutation } from "@tanstack/react-query";

import type {
  OutputLanguage,
  WritingLevel,
} from "@repo/api/domains/documents/schemas/document";
import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
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

import { useOpeningLabels } from "~/domains/openings/hooks/use-opening-labels";
import { useTRPC } from "~/tools/trpc/client";

import { useDocumentLabels } from "../hooks/use-document-labels";
import { useRefreshDocuments } from "../hooks/use-opening-documents";

const languages: OutputLanguage[] = ["en-US", "pt-BR"];
const tones: Tone[] = ["your_style", "formal", "direct", "warm", "technical"];
const withoutResume = "none";

/** The most recently changed resume version in a language, if any. */
const latestResumeIn = (versions: VersionView[], language: OutputLanguage) =>
  [...versions]
    .filter((version) => version.language === language)
    .sort(
      (a, b) => b.snapshot.createdAt.getTime() - a.snapshot.createdAt.getTime()
    )[0];

/**
 * The choices before a cover letter (resume spec, "Cover letter and its
 * resume"): its language, the resume version it accompanies (the most
 * recently changed one in that language comes chosen; none is allowed),
 * tone and writing level. Into a version, it generates that one again.
 */
export function GenerateLetterDialog({
  openingId,
  resumeVersions,
  defaultLanguage,
  defaultTone,
  versionId,
  trigger,
}: {
  openingId: string;
  resumeVersions: VersionView[];
  defaultLanguage: OutputLanguage;
  defaultTone: Tone;
  versionId?: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {/* Mounted per opening: the choices start fresh each time. */}
        <LetterForm
          openingId={openingId}
          resumeVersions={resumeVersions}
          defaultLanguage={defaultLanguage}
          defaultTone={defaultTone}
          versionId={versionId}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function LetterForm({
  openingId,
  resumeVersions,
  defaultLanguage,
  defaultTone,
  versionId,
  onDone,
}: {
  openingId: string;
  resumeVersions: VersionView[];
  defaultLanguage: OutputLanguage;
  defaultTone: Tone;
  versionId?: string;
  onDone: () => void;
}) {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const openingLabels = useOpeningLabels();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const [language, setLanguage] = useState(defaultLanguage);
  const [chosenResume, setChosenResume] = useState<string | null>(null);
  const [tone, setTone] = useState(defaultTone);
  const [writingLevel, setWritingLevel] = useState<WritingLevel>("standard");
  // A choice that no longer exists (deleted meanwhile) falls back.
  const chosen =
    chosenResume === withoutResume ||
    resumeVersions.some((version) => version.id === chosenResume)
      ? chosenResume
      : null;
  const resumeId =
    chosen ?? latestResumeIn(resumeVersions, language)?.id ?? withoutResume;
  const generate = useMutation(
    trpc.letters.generate.mutationOptions({
      onSuccess: async () => {
        await refresh();
        onDone();
      },
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {versionId
            ? t.formatMessage({ defaultMessage: "Generate the letter again" })
            : t.formatMessage({ defaultMessage: "Generate cover letter" })}
        </DialogTitle>
        <DialogDescription>
          {t.formatMessage({
            defaultMessage:
              "One story from your evidence, your motivation and the company facts you selected. It is more accurate with a resume.",
          })}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        {!versionId && (
          <div className="grid gap-1.5">
            <Label>
              {t.formatMessage({ defaultMessage: "Output language" })}
            </Label>
            <Select
              value={language}
              onValueChange={(value) => {
                setLanguage(value as OutputLanguage);
                setChosenResume(null);
              }}
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
        )}
        <div className="grid gap-1.5">
          <Label>{t.formatMessage({ defaultMessage: "Resume" })}</Label>
          <Select value={resumeId} onValueChange={setChosenResume}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {resumeVersions.map((version) => (
                <SelectItem key={version.id} value={version.id}>
                  {labels.version(version)}
                </SelectItem>
              ))}
              <SelectItem value={withoutResume}>
                {t.formatMessage({ defaultMessage: "Without a resume" })}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
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
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={generate.isPending}
          onClick={() =>
            generate.mutate({
              openingId,
              language,
              tone,
              writingLevel,
              resumeVersionId: resumeId === withoutResume ? null : resumeId,
              versionId,
            })
          }
        >
          {t.formatMessage({ defaultMessage: "Generate" })}
        </Button>
      </DialogFooter>
    </>
  );
}
