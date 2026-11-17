"use client";

import { useState, type ReactNode } from "react";

import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Send } from "lucide-react";
import { useRouter } from "next/navigation";

import type {
  CoverageReviewView,
  CoverageView,
  VersionView,
} from "@repo/api/domains/documents/schemas/document-view";
import { formatPeriod } from "@repo/api/domains/documents/rendering/output-conventions";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/web/components/ui/collapsible";
import { toast } from "@repo/web/components/ui/sonner";
import { cn } from "@repo/web/lib/utils";

import { useTRPC } from "~/tools/trpc/client";

import { focusDocumentLine } from "../utils/focus-line";
import { ProfilePassage } from "./resume-editor";

type Finding = CoverageView["findings"][number];

/** Whether the version's official snapshot has findings that block it. */
export const hasFindings = (version: VersionView) =>
  (version.coverage?.findings.length ?? 0) > 0;

/**
 * A resume version's coverage review (resume spec, "Coverage review"): the
 * code checks' findings first, since they block the document until fixed,
 * then the AI review of the version, section by section, ending with the
 * method's statement.
 */
export function CoverageReviewBlock({ version }: { version: VersionView }) {
  const t = useTranslation();
  const coverage = version.coverage;
  if (!coverage) return null;
  const { findings, review } = coverage;

  return (
    <div className="bg-background flex flex-col gap-2 rounded-lg border p-2.5 text-xs">
      <p className="text-sm font-medium">
        {t.formatMessage({ defaultMessage: "Coverage review" })}
      </p>

      {findings.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 p-2.5">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-3.5 shrink-0 text-red-600 dark:text-red-400" />
            {t.formatMessage({
              defaultMessage: "Fix before downloading or sending",
            })}
          </p>
          <ul className="flex flex-col gap-1">
            {findings.map((finding, index) => (
              <li key={index}>
                <FindingItem finding={finding} version={version} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-muted-foreground">
          {t.formatMessage({
            defaultMessage: "Nothing to fix: every check passes.",
          })}
        </p>
      )}

      {review ? (
        <>
          {!coverage.current && (
            <p className="text-muted-foreground">
              {t.formatMessage({
                defaultMessage:
                  "This review is of an earlier change of this version: your later edits aren't reviewed, but the checks above are.",
              })}
            </p>
          )}
          <ReviewSections review={review} version={version} />
        </>
      ) : (
        <p className="text-muted-foreground">
          {t.formatMessage({
            defaultMessage:
              "This version has no AI review; only the checks above run on it.",
          })}
        </p>
      )}
    </div>
  );
}

/** One finding in plain words; clicking it brings the line into view. */
function FindingItem({
  finding,
  version,
}: {
  finding: Finding;
  version: VersionView;
}) {
  const text = useFindingText(finding, version);
  const anchored = finding.lineId !== null || finding.positionId !== null;
  return anchored ? (
    <button
      type="button"
      className="text-left hover:underline"
      onClick={() => focusDocumentLine(finding)}
    >
      {text}
    </button>
  ) : (
    <span>{text}</span>
  );
}

/** The wording of a finding, from its code and what the check recorded. */
function useFindingText(finding: Finding, version: VersionView) {
  const t = useTranslation();
  const { text, params } = finding;
  const str = (key: string) => String(params[key] ?? "");
  switch (finding.code) {
    case "figure":
      return t.formatMessage(
        {
          defaultMessage:
            "“{text}” has a number your profile doesn't mark as measured ({figures}).",
        },
        { text, figures: str("figures") }
      );
    case "neverInclude":
      return t.formatMessage(
        {
          defaultMessage:
            "“{text}” names something your communication rules say never to include ({term}).",
        },
        { text, term: str("term") }
      );
    case "neverClaim":
      return t.formatMessage(
        {
          defaultMessage:
            "“{text}” claims something your communication rules say never to claim ({term}).",
        },
        { text, term: str("term") }
      );
    case "notDone":
      return t.formatMessage(
        {
          defaultMessage:
            "“{text}” names {name}, which your profile says you did not do at this position.",
        },
        { text, name: str("name") }
      );
    case "studied":
      return t.formatMessage(
        {
          defaultMessage:
            "“{text}” names {name}, which your profile marks as only studied.",
        },
        { text, name: str("name") }
      );
    case "lockedFact":
      return "employer" in params
        ? t.formatMessage(
            {
              defaultMessage:
                "{text}: employer, title or dates differ from your profile ({title}, {employer}, {period}).",
            },
            {
              text,
              title: str("title"),
              employer: str("employer"),
              period: formatPeriod(
                str("startDate") || null,
                str("endDate") || null,
                version.language
              ),
            }
          )
        : t.formatMessage(
            { defaultMessage: "{text}: your profile has no such position." },
            { text }
          );
    case "bulletCount":
      return t.formatMessage(
        {
          defaultMessage:
            "{text}: {count, plural, =0 {no bullets} one {# bullet} other {# bullets}}, over the {limit} your settings allow for {age, select, recent {a recent} older {an older} other {a very old}} position.",
        },
        {
          text,
          count: Number(params.count ?? 0),
          limit: Number(params.limit ?? 0),
          age: str("age"),
        }
      );
    case "pages":
      return t.formatMessage(
        {
          defaultMessage:
            "{measured, select, yes {{pages} pages in the PDF} other {About {pages} pages}}: over the page limit this document was written with ({limit}). {position, select, none {Turn off an optional section.} other {Trim the bullets of {position}, your oldest position, or turn off an optional section.}}",
        },
        {
          pages: t.formatNumber(Number(params.pages ?? version.pages)),
          limit: Number(params.maxPages ?? version.maxPages),
          measured: version.pdf.ready ? "yes" : "no",
          position: oldestWithBullets(version) ?? "none",
        }
      );
    case "veryOld":
      return t.formatMessage(
        {
          defaultMessage:
            "{text} is over {years} years old and no requirement of this document justifies keeping it.",
        },
        { text, years: Number(params.years ?? 0) }
      );
  }
}

/** Where trimming costs least: the oldest position that still has bullets. */
export function oldestWithBullets(version: VersionView) {
  if (version.content.kind !== "resume") return null;
  const entries = version.content.sections.flatMap((section) =>
    section.kind === "experience" ? section.entries : []
  );
  return entries.findLast((entry) => entry.lines.length > 0)?.employer ?? null;
}

/** The AI review, a collapsible section per block of the method's report. */
function ReviewSections({
  review,
  version,
}: {
  review: CoverageReviewView;
  version: VersionView;
}) {
  const t = useTranslation();
  const router = useRouter();
  const trpc = useTRPC();
  // Sent once: the suggestion waits in the profile's draft.
  const [sent, setSent] = useState<string[]>([]);
  const sendToProfile = useMutation(
    trpc.documents.sendToProfile.mutationOptions({
      onSuccess: (_, input) => {
        setSent((rows) => [...rows, input.lineId]);
        toast.success(
          t.formatMessage({
            defaultMessage: "The suggestion is waiting for you in My career.",
          }),
          {
            action: {
              label: t.formatMessage({ defaultMessage: "Open My career" }),
              onClick: () => router.push("/app/career"),
            },
          }
        );
      },
      onError: (error) => toast.error(error.message),
    })
  );
  const { sources } = review;
  const purpose =
    sources.purpose.kind === "focus"
      ? sources.purpose.focus
      : sources.purpose.title && sources.purpose.company
        ? t.formatMessage(
            { defaultMessage: "{title} at {company}" },
            {
              title: sources.purpose.title,
              company: sources.purpose.company,
            }
          )
        : (sources.purpose.title ??
          sources.purpose.company ??
          t.formatMessage({ defaultMessage: "this opening" }));
  const toLine = (line: { lineId: string; lineText: string }) => (
    <button
      type="button"
      className="text-left hover:underline"
      onClick={() =>
        focusDocumentLine({ lineId: line.lineId, positionId: null })
      }
    >
      {t.formatMessage(
        { defaultMessage: "“{quote}”" },
        { quote: line.lineText }
      )}
    </button>
  );

  return (
    <div className="flex flex-col gap-1">
      <ReviewSection
        title={t.formatMessage({ defaultMessage: "Sources used" })}
      >
        <p>
          {t.formatMessage(
            {
              defaultMessage:
                "{version, select, none {Your profile} other {Profile version {version}}} · {purpose} · {instructions, plural, =0 {no instructions} one {# instruction} other {# instructions}}",
            },
            {
              version: sources.profileVersionNumber ?? "none",
              purpose,
              instructions: sources.instructions,
            }
          )}
        </p>
      </ReviewSection>

      <ReviewSection
        title={t.formatMessage({ defaultMessage: "Preserved" })}
        count={review.preserved.length}
      >
        <ul className="flex flex-col gap-0.5">
          {review.preserved.map((entry) => (
            <li key={entry.positionId}>
              {t.formatMessage(
                {
                  defaultMessage:
                    "{employer} — {title} · {period} · {bullets, plural, =0 {no bullets} one {# bullet} other {# bullets}}",
                },
                {
                  employer: entry.employer,
                  title: entry.title,
                  period: formatPeriod(
                    entry.startDate,
                    entry.endDate,
                    version.language
                  ),
                  bullets: entry.bullets,
                }
              )}
            </li>
          ))}
        </ul>
      </ReviewSection>

      <ReviewSection
        title={t.formatMessage({ defaultMessage: "Strong coverage" })}
        count={review.strong.length}
      >
        <ul className="flex flex-col gap-2">
          {review.strong.map((row, index) => (
            <li key={index} className="flex flex-col gap-0.5">
              <span className="font-medium">{row.requirement}</span>
              {toLine(row)}
              <div className="text-muted-foreground border-l-2 pl-2">
                <ProfilePassage passage={row.evidence} />
              </div>
            </li>
          ))}
        </ul>
      </ReviewSection>

      <ReviewSection
        title={t.formatMessage({ defaultMessage: "Partial coverage" })}
        count={review.partial.length}
      >
        <ul className="flex flex-col gap-1">
          {review.partial.map((row, index) => (
            <li key={index} className="flex flex-col gap-0.5">
              <span className="font-medium">{row.requirement}</span>
              <span className="text-muted-foreground">{row.explanation}</span>
            </li>
          ))}
        </ul>
      </ReviewSection>

      <ReviewSection
        title={t.formatMessage({ defaultMessage: "Gaps not invented" })}
        count={review.gaps.length}
      >
        <ul className="flex flex-col gap-1">
          {review.gaps.map((gap) => (
            <li key={gap} className="flex flex-col gap-0.5">
              <span className="font-medium">{gap}</span>
              <span className="text-muted-foreground">
                {t.formatMessage({
                  defaultMessage: "No evidence in your profile.",
                })}
              </span>
            </li>
          ))}
        </ul>
      </ReviewSection>

      <ReviewSection
        title={t.formatMessage({ defaultMessage: "Inconsistencies" })}
        count={review.inconsistencies.length}
        defaultOpen={review.inconsistencies.length > 0}
        attention={review.inconsistencies.length > 0}
      >
        <ul className="flex flex-col gap-1">
          {review.inconsistencies.map((row, index) => (
            <li key={index} className="flex flex-col gap-0.5">
              {toLine(row)}
              <span className="text-muted-foreground">{row.explanation}</span>
            </li>
          ))}
        </ul>
      </ReviewSection>

      <ReviewSection
        title={t.formatMessage({ defaultMessage: "Suggestions" })}
        count={review.suggestions.length}
        defaultOpen={review.suggestions.length > 0}
      >
        <ul className="flex flex-col gap-2">
          {review.suggestions.map((row, index) => {
            const { lineId } = row;
            const done = lineId !== null && sent.includes(lineId);
            return (
              <li key={index} className="flex flex-col gap-1">
                {lineId && row.lineText
                  ? toLine({ lineId, lineText: row.lineText })
                  : null}
                <span>{row.text}</span>
                {row.kind === "profile" && lineId && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="self-start"
                    disabled={done || sendToProfile.isPending}
                    onClick={() =>
                      sendToProfile.mutate({
                        coverageReviewId: review.id,
                        lineId,
                      })
                    }
                  >
                    <Send />
                    {done
                      ? t.formatMessage({
                          defaultMessage: "Sent to my profile",
                        })
                      : t.formatMessage({
                          defaultMessage: "Send to my profile",
                        })}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </ReviewSection>

      <blockquote className="border-primary/40 text-muted-foreground mt-1 border-l-2 pl-2 italic">
        {review.statement}
      </blockquote>
    </div>
  );
}

/** A block of the review, folded by default, with how many items it has. */
function ReviewSection({
  title,
  count,
  defaultOpen = false,
  attention = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  attention?: boolean;
  children: ReactNode;
}) {
  const t = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const empty = count === 0;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-1 py-0.5 text-left",
          empty && "text-muted-foreground"
        )}
      >
        <ChevronRight
          className={cn("size-3.5 transition-transform", open && "rotate-90")}
        />
        <span className={cn("font-medium", attention && "text-amber-600")}>
          {title}
        </span>
        {count !== undefined && (
          <span className="text-muted-foreground">
            {t.formatMessage(
              { defaultMessage: "({count, number})" },
              { count }
            )}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1 pb-1.5 pl-4.5">
        {empty ? (
          <p className="text-muted-foreground">
            {t.formatMessage({ defaultMessage: "Nothing here." })}
          </p>
        ) : (
          children
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
