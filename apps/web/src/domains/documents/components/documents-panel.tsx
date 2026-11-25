"use client";

import type { ReactNode } from "react";

import { FileText, Plus } from "lucide-react";

import type {
  GenerationKind,
  OutputLanguage,
} from "@repo/api/domains/documents/schemas/document";
import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";
import type { TaskProgress } from "@repo/api/domains/tasks/schemas/task";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { cn } from "@repo/web/lib/utils";

import { AiAtWork } from "~/domains/workspace/components/ai-at-work";

import { useDocumentLabels } from "../hooks/use-document-labels";
import { useOpeningDocuments } from "../hooks/use-opening-documents";
import { useSelectedVersion } from "../hooks/use-selected-version";
import { AdaptVersionDialog } from "./adapt-version-dialog";
import { CoverageReviewBlock } from "./coverage-review";
import { CoverageScore } from "./coverage-score";
import { oldestWithBullets, pageLimitText } from "../utils/version-checks";
import { DownloadZipButton } from "./download-zip-button";
import { GenerateResumeDialog } from "./generate-resume-dialog";
import { OutdatedNotice, SyncProposal } from "./language-sync";

/**
 * The side panel's Documents block (workspace spec): the resume with a row
 * per version, the generation in progress, and what the version open in
 * the editor emphasizes, its ATS check and its length warning.
 */
export function DocumentsPanel({
  openingId,
  defaultLanguage,
  defaultTone,
  pendingGaps,
  actions,
}: {
  openingId: string;
  defaultLanguage: OutputLanguage;
  defaultTone: Tone;
  pendingGaps: number;
  /** The selected version's actions, when the editor is open beside. */
  actions?: (version: VersionView) => ReactNode;
}) {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const documents = useOpeningDocuments(openingId);
  const resume = documents.data?.documents.find((d) => d.kind === "resume");
  const versions = resume?.versions ?? [];
  const { selected, select } = useSelectedVersion(versions);
  const generation = resume?.generation;
  const running =
    generation?.status === "pending" || generation?.status === "running";

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          {t.formatMessage({ defaultMessage: "Documents" })}
        </h3>
        {versions.length > 0 && (
          <AdaptVersionDialog
            versions={versions}
            trigger={
              <Button size="sm" variant="ghost" disabled={running}>
                <Plus />
                {t.formatMessage({ defaultMessage: "New version" })}
              </Button>
            }
            scratch={
              <GenerateResumeDialog
                openingId={openingId}
                defaultLanguage={defaultLanguage}
                defaultTone={documents.data?.application?.tone ?? defaultTone}
                pendingGaps={pendingGaps}
                existingLanguages={versions.map((version) => version.language)}
                application={documents.data?.application ?? null}
                trigger={
                  <Button>
                    {t.formatMessage({ defaultMessage: "Continue" })}
                  </Button>
                }
              />
            }
          />
        )}
      </div>

      {running && <GenerationProgress generation={generation} />}
      {generation?.status === "failed" && (
        <p className="border-destructive/40 bg-destructive/10 rounded-lg border p-2.5 text-xs">
          {t.formatMessage({
            defaultMessage: "The last generation failed. Try again.",
          })}
        </p>
      )}

      {versions.length === 0 && !running && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs">
            {t.formatMessage({
              defaultMessage:
                "Get a resume tailored to this opening, whatever the fit check says.",
            })}
          </p>
          <GenerateResumeDialog
            openingId={openingId}
            defaultLanguage={defaultLanguage}
            defaultTone={defaultTone}
            pendingGaps={pendingGaps}
            existingLanguages={[]}
            application={documents.data?.application ?? null}
            trigger={
              <Button size="sm" className="self-start">
                <FileText />
                {t.formatMessage({ defaultMessage: "Generate resume" })}
              </Button>
            }
          />
        </div>
      )}

      {versions.length > 0 && (
        <ul className="flex flex-col gap-1">
          {versions.map((version) => (
            <li key={version.id}>
              <button
                type="button"
                onClick={() => select(version.id)}
                className={cn(
                  "bg-card flex w-full items-center justify-between rounded-lg border p-2.5 text-left text-sm",
                  selected?.id === version.id && "border-primary"
                )}
              >
                <span>
                  {t.formatMessage(
                    { defaultMessage: "Resume · {version}" },
                    { version: labels.version(version) }
                  )}
                </span>
                <span className="text-muted-foreground text-[11px]">
                  {version.sent
                    ? version.sent.snapshotId === version.snapshot.id
                      ? t.formatMessage({ defaultMessage: "Sent as it is" })
                      : t.formatMessage({
                          defaultMessage: "Sent; edited since",
                        })
                    : t.formatMessage(
                        {
                          defaultMessage:
                            "{count, plural, one {# change} other {# changes}}",
                        },
                        { count: version.snapshotCount }
                      )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && actions?.(selected)}
      {versions.length > 0 && (
        <DownloadZipButton
          openingId={openingId}
          // Every document of the application goes in the ZIP.
          versions={(documents.data?.documents ?? []).flatMap(
            (document) => document.versions
          )}
        />
      )}
      {resume && <SyncProposal document={resume} versions={versions} />}
      {selected && <OutdatedNotice version={selected} versions={versions} />}
      {selected && <VersionChecks version={selected} />}
    </section>
  );
}

/** A generation at work: its steps, the review round under way. */
export function GenerationProgress({
  generation,
  title,
}: {
  generation: {
    kind: GenerationKind;
    adjusted: boolean;
    progress: TaskProgress | null;
  };
  /** What is being written, when not a resume (the LinkedIn text). */
  title?: string;
}) {
  const t = useTranslation();
  const { progress } = generation;
  if (generation.kind === "linkedin_review") {
    return (
      <AiAtWork
        title={t.formatMessage({ defaultMessage: "Reviewing your LinkedIn" })}
        current={progress?.label ?? "coverage_review"}
        steps={[
          {
            key: "coverage_review",
            label: t.formatMessage({
              defaultMessage: "Checking every line against your profile",
            }),
          },
          {
            key: "saving",
            label: t.formatMessage({ defaultMessage: "Saving the review" }),
          },
        ]}
      />
    );
  }
  if (generation.kind === "linkedin_section") {
    return (
      <AiAtWork
        title={t.formatMessage({
          defaultMessage: "Writing this section",
        })}
        current={progress?.label ?? "drafting"}
        steps={[
          {
            key: "drafting",
            label: t.formatMessage({
              defaultMessage: "Drafting from your published profile",
            }),
          },
          {
            key: "saving",
            label: t.formatMessage({
              defaultMessage: "Checking facts and saving the version",
            }),
          },
        ]}
      />
    );
  }
  if (generation.kind === "adapt" || generation.kind === "sync") {
    return (
      <AiAtWork
        title={
          generation.kind === "adapt"
            ? t.formatMessage({ defaultMessage: "Adapting the resume" })
            : t.formatMessage({ defaultMessage: "Syncing the languages" })
        }
      />
    );
  }
  // Step 1 drafts, then the rounds, the coverage review and saving: an
  // adjustment runs no round, so it has three steps.
  const rounds = progress ? progress.totalSteps - 3 : 0;
  const round = progress?.label === "review_round" ? progress.step - 1 : 0;
  const steps = [
    {
      key: "drafting",
      label: t.formatMessage({
        defaultMessage: "Drafting from your published profile",
      }),
    },
    {
      key: "review_round",
      label:
        rounds > 0
          ? t.formatMessage(
              {
                defaultMessage:
                  "Reviewing and tightening (round {round} of {total})",
              },
              { round: Math.max(round, 1), total: rounds }
            )
          : t.formatMessage({ defaultMessage: "Reviewing and tightening" }),
    },
    {
      key: "coverage_review",
      label: t.formatMessage({
        defaultMessage: "Reviewing coverage against your profile",
      }),
    },
    {
      key: "saving",
      label: t.formatMessage({
        defaultMessage: "Checking facts and saving the version",
      }),
    },
  ];
  return (
    <AiAtWork
      title={
        title ??
        (generation.adjusted
          ? t.formatMessage({ defaultMessage: "Adjusting your resume" })
          : t.formatMessage({ defaultMessage: "Writing your resume" }))
      }
      current={progress?.label ?? "drafting"}
      // An adjustment runs no review round: it drafts, then saves.
      steps={steps.filter(
        (step) => step.key !== "review_round" || !progress || rounds > 0
      )}
    />
  );
}

/**
 * What comes with a version: its coverage review (a resume's), what its
 * latest generation emphasized (or, for an adjustment, changed), the length
 * warning on the estimate (until a resume's PDF is measured, when an
 * overflow becomes a finding) and the ATS check.
 */
export function VersionChecks({ version }: { version: VersionView }) {
  const t = useTranslation();
  const ats = version.atsCheck;
  const emphasis = version.emphasis?.lines.length ? version.emphasis : null;

  return (
    <div className="flex flex-col gap-2">
      <CoverageScore version={version} />
      <CoverageReviewBlock version={version} />
      {/* Measured over the limit, a resume shows it as a finding instead. */}
      {version.pages > version.maxPages &&
        !(version.coverage && version.pdf.ready) && (
          <p className="border-warning-border bg-warning-soft rounded-lg border p-2.5 text-xs">
            {pageLimitText(t, {
              limit: version.maxPages,
              measured: version.pdf.ready,
              pages: t.formatNumber(version.pages),
              position: oldestWithBullets(version),
            })}
          </p>
        )}
      {emphasis && (
        <div className="bg-card flex flex-col gap-1.5 rounded-lg border p-2.5 text-xs">
          <p className="text-sm font-medium">
            {emphasis.adjusted
              ? t.formatMessage({
                  defaultMessage:
                    "What changed from the version it started from",
                })
              : t.formatMessage({
                  defaultMessage: "What this version emphasizes",
                })}
          </p>
          <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-4">
            {emphasis.lines.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {ats && (
        <div className="bg-card flex flex-col gap-2 rounded-lg border p-2.5 text-xs">
          <p className="text-sm font-medium">
            {t.formatMessage(
              { defaultMessage: "ATS check: {matched} of {total} keywords" },
              { matched: ats.matched.length, total: ats.total }
            )}
          </p>
          {ats.useOpeningTerm.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">
                {t.formatMessage({
                  defaultMessage: "You have it, use the opening's term:",
                })}
              </span>
              <div className="flex flex-wrap gap-1">
                {ats.useOpeningTerm.map((term) => (
                  <Badge key={term} variant="secondary">
                    {term}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {ats.realGaps.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">
                {t.formatMessage({ defaultMessage: "Real gaps:" })}
              </span>
              <div className="flex flex-wrap gap-1">
                {ats.realGaps.map((term) => (
                  <Badge key={term} variant="outline">
                    {term}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
