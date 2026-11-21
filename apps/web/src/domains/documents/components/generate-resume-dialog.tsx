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
import { reviewLoopSettings } from "@repo/api/domains/documents/generation/review-loop-settings";
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

import { InstructionsReview } from "~/domains/applications/components/instructions-review";
import { useApplicationInstructions } from "~/domains/applications/hooks/use-application-instructions";
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
 * The choices before generating a resume (resume spec): output language
 * (preselected from the opening), review depth, writing level, tone
 * (preselected from the opening's suggestion) and the generation settings
 * for this document. Into an existing version the result becomes its new
 * snapshot. With a reference it adjusts that version instead (the
 * method's prompt 04b): no review rounds, and in the reference's language,
 * since its bullets are kept as written.
 */
export function GenerateResumeDialog({
  openingId,
  defaultLanguage,
  defaultTone,
  versionId,
  pendingGaps,
  existingLanguages = [],
  application,
  reference,
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
  /** "Adjust": the similar version the new document starts from. */
  reference?: { versionId: string; language: OutputLanguage };
  trigger: ReactNode;
}) {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const openingLabels = useOpeningLabels();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const [open, setOpen] = useState(false);
  const credits = useCredits();
  const documentSettings = useDocumentSettings(open);
  const [language, setLanguage] = useState(
    reference?.language ?? defaultLanguage
  );
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
  // The depth chosen holds for a generation; an adjustment has no rounds.
  const depth = reference ? "quick" : reviewDepth;
  const instructions = useApplicationInstructions(openingId);
  const [unreviewed, setUnreviewed] = useState(false);
  // Points are reviewed before generating (resume spec).
  const instructionsPending =
    !!instructions.data?.splitting ||
    !!instructions.data?.points.some((point) => point.status === "draft") ||
    !!instructions.data?.overrides.some((row) => !row.confirmed);
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // The settings form starts from the defaults each time it opens.
        if (next) documentSettings.reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {reference
              ? t.formatMessage({ defaultMessage: "Adjust for this opening" })
              : versionId
                ? t.formatMessage({ defaultMessage: "Generate again" })
                : t.formatMessage({ defaultMessage: "Generate resume" })}
          </DialogTitle>
          <DialogDescription>
            {reference
              ? t.formatMessage({
                  defaultMessage:
                    "Starts from the version you chose and changes only the order of bullets, the order of competencies and the summary. You review the result afterwards.",
                })
              : t.formatMessage({
                  defaultMessage:
                    "Written only from your published profile. You review every line afterwards.",
                })}
          </DialogDescription>
        </DialogHeader>

        {documentSettings.unpublished && <PublishProfileNotice />}
        {reference && reference.language !== defaultLanguage && (
          <p className="text-muted-foreground text-xs">
            {t.formatMessage(
              {
                defaultMessage:
                  "The result stays in {language}, the language of that version: its bullets are kept as written.",
              },
              { language: labels.language(reference.language) }
            )}
          </p>
        )}

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
          {!versionId && !reference && (
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

          {/* An adjustment runs no review rounds. */}
          {!reference && (
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
                    className="bg-card flex items-start gap-2 rounded-md border p-2.5 text-sm"
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
                                  "Up to {rounds} review rounds, stopping early when coverage stops improving. The best version is kept.",
                              },
                              {
                                rounds:
                                  reviewLoopSettings.reviewRounds.thorough,
                              }
                            )}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          )}

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
            {credits.data?.plan === "free" && !reference && (
              <p className="text-muted-foreground text-xs">
                {t.formatMessage({
                  defaultMessage:
                    "Quick with the standard level comes chosen on Free: it leaves enough credits for the second language and the cover letter.",
                })}
              </p>
            )}
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

        <InstructionsReview
          openingId={openingId}
          onUnreviewedChange={setUnreviewed}
        />

        <DocumentSettings
          value={documentSettings.value}
          onChange={documentSettings.onChange}
        />

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

        {(instructionsPending || unreviewed) && (
          <p className="text-muted-foreground text-xs">
            {t.formatMessage({
              defaultMessage:
                "Review your instructions before generating, or clear them.",
            })}
          </p>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <Link
            href="/app/writing"
            className="text-muted-foreground text-xs underline-offset-4 hover:underline"
          >
            {t.formatMessage({
              defaultMessage: "Template, settings and style",
            })}
          </Link>
          <CreditCost
            credits={resumeCredits(credits.data?.estimates, {
              reviewDepth: depth,
              writingLevel,
            })}
          />
          <Button
            disabled={
              generate.isPending ||
              instructionsPending ||
              unreviewed ||
              documentSettings.unpublished ||
              documentSettings.invalid
            }
            onClick={() =>
              generate.mutate({
                openingId,
                language,
                reviewDepth: depth,
                writingLevel,
                tone,
                versionId,
                referenceVersionId: reference?.versionId,
                settings: documentSettings.settings,
                sectionsForcedIn: resumeSectionKinds.filter(
                  (kind) => forced[kind] === "in"
                ),
                sectionsForcedOut: resumeSectionKinds.filter(
                  (kind) => forced[kind] === "out"
                ),
              })
            }
          >
            {reference
              ? t.formatMessage({ defaultMessage: "Adjust" })
              : repeatsLanguage
                ? t.formatMessage({ defaultMessage: "Create another version" })
                : t.formatMessage({ defaultMessage: "Generate" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
