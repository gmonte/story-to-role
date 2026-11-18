"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { ExternalLink, FileText } from "lucide-react";
import Link from "next/link";

import type { OpeningDetail } from "@repo/api/domains/openings/schemas/opening-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { ApplicationContext } from "~/domains/applications/components/application-context";
import { ApplicationTracker } from "~/domains/applications/components/application-tracker";
import { CompanyResearch } from "~/domains/applications/components/company-research";
import { CoverLetterPrep } from "~/domains/applications/components/cover-letter-prep";
import { GenerateResumeDialog } from "~/domains/documents/components/generate-resume-dialog";
import { ResumeWorkspace } from "~/domains/documents/components/resume-workspace";
import { SimilarDocuments } from "~/domains/documents/components/similar-documents";
import { AiAtWork } from "~/domains/workspace/components/ai-at-work";

import { useRefreshOpenings } from "../hooks/use-opening";
import { useOpeningLabels } from "../hooks/use-opening-labels";
import type { OpeningView as Step } from "../utils/opening-journey";
import { FitStep, pendingGaps } from "./fit-check-panel";
import { useOpeningJourney } from "./opening-header";

/**
 * The center of the opening page: the active step's content. Every step
 * keeps the document workspace's three zones (a left column, the content,
 * the page's right column), so switching steps never moves anything.
 */
export function OpeningView({
  openingId,
  opening,
  view,
  setView,
}: {
  openingId: string;
  opening: OpeningDetail;
  view: Step;
  setView: (view: Step) => void;
}) {
  const t = useTranslation();
  const refresh = useRefreshOpenings();
  const journey = useOpeningJourney(openingId, opening);

  // The sidebar's list learns the title once the analysis ends.
  const status = opening.status;
  useEffect(() => {
    if (status !== "processing") void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // A generation just started opens its step: the progress is the page.
  const wasGenerating = useRef({ resume: false, letter: false });
  useEffect(() => {
    const previous = wasGenerating.current;
    if (journey.resumeGenerating && !previous.resume) setView("resume");
    if (journey.letterGenerating && !previous.letter) setView("letter");
    wasGenerating.current = {
      resume: journey.resumeGenerating,
      letter: journey.letterGenerating,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey.resumeGenerating, journey.letterGenerating]);

  const context = opening.status === "analyzed" && (
    <ApplicationContext openingId={openingId} />
  );

  switch (view) {
    case "opening":
      return (
        <StepFrame aside={context}>
          <OpeningStep opening={opening} />
        </StepFrame>
      );
    case "fit":
      return (
        <StepFrame aside={context}>
          <FitStep opening={opening} />
        </StepFrame>
      );
    case "resume": {
      const versions = journey.resume?.versions ?? [];
      if (versions.length > 0 || journey.resumeGenerating) {
        return (
          <ResumeWorkspace
            versions={versions}
            generation={journey.resume?.generation}
          />
        );
      }
      return (
        <StepFrame aside={context}>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <h2 className="font-medium">
                {t.formatMessage({
                  defaultMessage: "No resume for this opening yet.",
                })}
              </h2>
              <p className="text-muted-foreground text-sm">
                {t.formatMessage({
                  defaultMessage:
                    "Written from your published profile only, whatever the fit check says; then you review every line.",
                })}
              </p>
              {journey.resume?.generation?.status === "failed" && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-xs">
                  {t.formatMessage({
                    defaultMessage: "The last generation failed. Try again.",
                  })}
                </p>
              )}
              {journey.documents.data && (
                <GenerateResumeDialog
                  openingId={openingId}
                  defaultLanguage={journey.language}
                  defaultTone={journey.tone}
                  pendingGaps={pendingGaps(opening)}
                  existingLanguages={[]}
                  application={journey.application}
                  trigger={
                    <Button className="self-start">
                      <FileText />
                      {t.formatMessage({ defaultMessage: "Generate resume" })}
                    </Button>
                  }
                />
              )}
            </div>
            <SimilarDocuments
              openingId={openingId}
              defaultLanguage={journey.language}
              defaultTone={journey.tone}
              pendingGaps={pendingGaps(opening)}
            />
          </div>
        </StepFrame>
      );
    }
    case "letter":
      return (
        <CoverLetterPrep
          openingId={openingId}
          defaultLanguage={journey.language}
          defaultTone={journey.tone}
          aside={
            <>
              {context}
              <CompanyResearch
                openingId={openingId}
                hasCompany={!!opening.company}
              />
            </>
          }
        />
      );
    case "application":
      return (
        <StepFrame aside={context}>
          <div className="flex flex-col gap-4">
            <h2 className="font-medium">
              {t.formatMessage({ defaultMessage: "Application" })}
            </h2>
            <ApplicationTracker openingId={openingId} />
            <Button asChild variant="outline" size="sm" className="self-start">
              <Link href="/app/tracker">
                {t.formatMessage({ defaultMessage: "All applications" })}
              </Link>
            </Button>
          </div>
        </StepFrame>
      );
  }
}

/** The three zones of a step without a document: context, content. */
function StepFrame({
  aside,
  children,
}: {
  aside: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-60 shrink-0 space-y-6 overflow-y-auto border-r p-4 md:block">
        {aside}
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

/** The Opening step: what the person pasted, first. */
function OpeningStep({ opening }: { opening: OpeningDetail }) {
  const t = useTranslation();
  const labels = useOpeningLabels();

  if (opening.status === "processing") {
    const found = opening.progress?.counts;
    return (
      <div className="mx-auto w-full max-w-md py-6">
        <AiAtWork
          title={t.formatMessage({
            defaultMessage: "Reading the opening and checking your fit",
          })}
          current={opening.progress?.label ?? "reading"}
          steps={[
            {
              key: "reading",
              label: t.formatMessage({ defaultMessage: "Reading the opening" }),
            },
            {
              key: "requirements",
              label: t.formatMessage({
                defaultMessage: "Listing what it asks for",
              }),
            },
            {
              key: "matching",
              label: t.formatMessage({
                defaultMessage:
                  "Looking for the passages of your profile behind each point",
              }),
            },
            {
              key: "judging",
              label: t.formatMessage({
                defaultMessage: "Weighing what you have against each one",
              }),
            },
          ]}
          detail={
            found?.requirements !== undefined &&
            t.formatMessage(
              {
                defaultMessage:
                  "It asks for {keywords, plural, =0 {no listed skills} one {# skill} other {# skills}} and {requirements, plural, =0 {no other requirements} one {# requirement} other {# requirements}}.",
              },
              {
                keywords: found.keywords ?? 0,
                requirements: found.requirements,
              }
            )
          }
          note={t.formatMessage({
            defaultMessage: "You can leave this page; the result will be here.",
          })}
        />
      </div>
    );
  }

  return (
    <>
      {opening.status === "external" && (
        <div className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
          <p>
            {t.formatMessage({
              defaultMessage:
                "You applied to this opening outside StoryToRole, so it wasn’t analyzed. Analyze it to see your fit and write documents for it.",
            })}
          </p>
          {!opening.description && !opening.sourceUrl && (
            <p className="text-muted-foreground">
              {t.formatMessage({
                defaultMessage:
                  "Without its description or link, there is nothing to analyze.",
              })}
            </p>
          )}
        </div>
      )}

      {opening.status === "rejected" && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p>{labels.rejection(opening.rejectionReason)}</p>
        </div>
      )}

      {(opening.description ?? opening.notes) && (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">
            {opening.description
              ? t.formatMessage({ defaultMessage: "Description" })
              : t.formatMessage({ defaultMessage: "Notes" })}
          </h2>
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">
            {opening.description ?? opening.notes}
          </p>
        </section>
      )}

      {opening.sourceUrl && (
        <a
          href={opening.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-muted-foreground inline-flex items-center gap-1 text-sm underline"
        >
          <ExternalLink className="size-3.5" />
          {t.formatMessage({ defaultMessage: "Opening text" })}
        </a>
      )}
    </>
  );
}
