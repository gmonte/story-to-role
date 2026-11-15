"use client";

import { useState, type ReactNode } from "react";

import { useMutation } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import Link from "next/link";

import type {
  OutputLanguage,
  ReviewDepth,
  WritingLevel,
} from "@repo/api/domains/documents/schemas/document";
import { generationSettings } from "@repo/api/domains/documents/generation/generation-settings";
import {
  resumeSectionKinds,
  type ResumeSectionKind,
} from "@repo/api/domains/documents/schemas/resume-content";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/web/components/ui/collapsible";
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

import { useOpeningLabels } from "~/domains/openings/hooks/use-opening-labels";
import { useTRPC } from "~/tools/trpc/client";

import { useDocumentLabels } from "../hooks/use-document-labels";
import { useRefreshDocuments } from "../hooks/use-opening-documents";

const languages: OutputLanguage[] = ["en-US", "pt-BR"];
const tones: Tone[] = ["your_style", "formal", "direct", "warm", "technical"];

/**
 * The choices before generating a resume (resume spec): output language
 * (preselected from the opening), review depth, writing level and tone
 * (preselected from the opening's suggestion). Into an existing version
 * the result becomes its new snapshot.
 */
export function GenerateResumeDialog({
  openingId,
  defaultLanguage,
  defaultTone,
  versionId,
  pendingGaps,
  existingLanguages = [],
  application,
  trigger,
}: {
  openingId: string;
  defaultLanguage: OutputLanguage;
  defaultTone: Tone;
  versionId?: string;
  pendingGaps: number;
  /** Languages the resume already has: another one asks first. */
  existingLanguages?: OutputLanguage[];
  application?: {
    sectionsForcedIn: ResumeSectionKind[];
    sectionsForcedOut: ResumeSectionKind[];
  } | null;
  trigger: ReactNode;
}) {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const openingLabels = useOpeningLabels();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState(defaultLanguage);
  const [reviewDepth, setReviewDepth] = useState<ReviewDepth>("quick");
  const [writingLevel, setWritingLevel] = useState<WritingLevel>("standard");
  const [tone, setTone] = useState(defaultTone);
  const [forced, setForced] = useState<
    Partial<Record<ResumeSectionKind, "in" | "out">>
  >(() => ({
    ...Object.fromEntries(
      (application?.sectionsForcedIn ?? []).map((kind) => [kind, "in"])
    ),
    ...Object.fromEntries(
      (application?.sectionsForcedOut ?? []).map((kind) => [kind, "out"])
    ),
  }));
  const repeatsLanguage = !versionId && existingLanguages.includes(language);
  const generate = useMutation(
    trpc.documents.generateResume.mutationOptions({
      onSuccess: async () => {
        await refresh();
        setOpen(false);
      },
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {versionId
              ? t.formatMessage({ defaultMessage: "Generate again" })
              : t.formatMessage({ defaultMessage: "Generate resume" })}
          </DialogTitle>
          <DialogDescription>
            {t.formatMessage({
              defaultMessage:
                "Written only from your approved evidence. You review every line afterwards.",
            })}
          </DialogDescription>
        </DialogHeader>

        {pendingGaps > 0 && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
            {t.formatMessage(
              {
                defaultMessage:
                  "{count, plural, one {# gap question is} other {# gap questions are}} still unanswered. Answering first can strengthen the resume.",
              },
              { count: pendingGaps }
            )}
          </p>
        )}

        <div className="grid gap-4">
          {!versionId && (
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
          )}

          <div className="grid gap-1.5">
            <Label>{t.formatMessage({ defaultMessage: "Review" })}</Label>
            <RadioGroup
              value={reviewDepth}
              onValueChange={(value) => setReviewDepth(value as ReviewDepth)}
              className="grid gap-2"
            >
              {(["quick", "thorough"] as const).map((option) => (
                <label
                  key={option}
                  className="flex items-start gap-2 rounded-md border p-2.5 text-sm"
                >
                  <RadioGroupItem value={option} className="mt-0.5" />
                  <span>
                    <span className="font-medium">
                      {labels.reviewDepth(option)}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {option === "quick"
                        ? t.formatMessage({
                            defaultMessage: "One review round.",
                          })
                        : t.formatMessage(
                            {
                              defaultMessage:
                                "Up to {rounds} review rounds, stopping early when the rating stops improving. The best version is kept.",
                            },
                            { rounds: generationSettings.reviewRounds.thorough }
                          )}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="grid gap-1.5">
            <Label>
              {t.formatMessage({ defaultMessage: "Writing level" })}
            </Label>
            <RadioGroup
              value={writingLevel}
              onValueChange={(value) => setWritingLevel(value as WritingLevel)}
              className="flex gap-4"
            >
              {(["standard", "maximum"] as const).map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value={option} />
                  {labels.writingLevel(option)}
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="grid gap-1.5">
            <Label>{t.formatMessage({ defaultMessage: "Tone" })}</Label>
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

        {repeatsLanguage && (
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

        <Collapsible>
          <CollapsibleTrigger className="text-muted-foreground flex items-center gap-1 text-xs hover:underline">
            <ChevronDown className="size-3.5" />
            {t.formatMessage({
              defaultMessage: "Sections for this application",
            })}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 grid gap-1.5">
            {resumeSectionKinds.map((kind) => (
              <div
                key={kind}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span>{labels.section(kind)}</span>
                <Select
                  value={forced[kind] ?? "template"}
                  onValueChange={(value) =>
                    setForced({
                      ...forced,
                      [kind]: value === "template" ? undefined : value,
                    })
                  }
                >
                  <SelectTrigger className="h-7 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="template">
                      {t.formatMessage({
                        defaultMessage: "As in the template",
                      })}
                    </SelectItem>
                    <SelectItem value="in">
                      {t.formatMessage({ defaultMessage: "Always include" })}
                    </SelectItem>
                    <SelectItem value="out">
                      {t.formatMessage({ defaultMessage: "Leave out" })}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>

        <DialogFooter className="items-center sm:justify-between">
          <Link
            href="/app/writing"
            className="text-muted-foreground text-xs underline-offset-4 hover:underline"
          >
            {t.formatMessage({ defaultMessage: "Template, header and style" })}
          </Link>
          <Button
            disabled={generate.isPending}
            onClick={() =>
              generate.mutate({
                openingId,
                language,
                reviewDepth,
                writingLevel,
                tone,
                versionId,
                sectionsForcedIn: resumeSectionKinds.filter(
                  (kind) => forced[kind] === "in"
                ),
                sectionsForcedOut: resumeSectionKinds.filter(
                  (kind) => forced[kind] === "out"
                ),
              })
            }
          >
            {repeatsLanguage
              ? t.formatMessage({ defaultMessage: "Create another version" })
              : t.formatMessage({ defaultMessage: "Generate" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
