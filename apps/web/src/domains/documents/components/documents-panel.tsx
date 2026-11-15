"use client";

import { FileText, Loader2, Plus } from "lucide-react";

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

import { useDocumentLabels } from "../hooks/use-document-labels";
import { useOpeningDocuments } from "../hooks/use-opening-documents";
import { useSelectedVersion } from "../hooks/use-selected-version";
import { AdaptVersionDialog } from "./adapt-version-dialog";
import { GenerateResumeDialog } from "./generate-resume-dialog";
import { OutdatedNotice, SyncProposal } from "./language-sync";

/**
 * The side panel's Documents block (workspace spec): the resume with a row
 * per version, the generation in progress, the ATS check and the length
 * warning of the version open in the editor.
 */
export function DocumentsPanel({
  openingId,
  defaultLanguage,
  defaultTone,
  pendingGaps,
}: {
  openingId: string;
  defaultLanguage: OutputLanguage;
  defaultTone: Tone;
  pendingGaps: number;
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

      {running && (
        <div className="bg-background flex items-center gap-2 rounded-lg border p-2.5 text-xs">
          <Loader2 className="size-3.5 animate-spin" />
          <GenerationProgressLabel generation={generation} />
        </div>
      )}
      {generation?.status === "failed" && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-xs">
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
                  "bg-background flex w-full items-center justify-between rounded-lg border p-2.5 text-left text-sm",
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
                  {t.formatMessage(
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

      {resume && <SyncProposal document={resume} versions={versions} />}
      {selected && <OutdatedNotice version={selected} versions={versions} />}
      {selected && <VersionChecks version={selected} />}
    </section>
  );
}

function GenerationProgressLabel({
  generation,
}: {
  generation: { kind: GenerationKind; progress: TaskProgress | null };
}) {
  const t = useTranslation();
  const { progress } = generation;
  if (generation.kind === "adapt") {
    return t.formatMessage({ defaultMessage: "Adapting resume…" });
  }
  if (generation.kind === "sync") {
    return t.formatMessage({ defaultMessage: "Syncing languages…" });
  }
  switch (progress?.label) {
    case "review_round":
      // Step 1 drafts and the last step saves; the ones between are rounds.
      return t.formatMessage(
        {
          defaultMessage: "Generating resume: review round {round} of {total}",
        },
        { round: progress.step - 1, total: progress.totalSteps - 2 }
      );
    case "saving":
      return t.formatMessage({ defaultMessage: "Generating resume: saving" });
    default:
      return t.formatMessage({ defaultMessage: "Generating resume: drafting" });
  }
}

function VersionChecks({ version }: { version: VersionView }) {
  const t = useTranslation();
  const ats = version.atsCheck;

  return (
    <div className="flex flex-col gap-2">
      {version.pages > 2 && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
          {t.formatMessage(
            {
              defaultMessage:
                "About {pages} pages: over the two-page limit. Trim old positions' bullets or turn off an optional section.",
            },
            { pages: t.formatNumber(version.pages) }
          )}
        </p>
      )}
      {ats && (
        <div className="bg-background flex flex-col gap-2 rounded-lg border p-2.5 text-xs">
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
