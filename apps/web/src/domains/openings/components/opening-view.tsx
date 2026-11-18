"use client";

import { useEffect, useState, useId } from "react";

import { useMutation } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type {
  FitCheckItemView,
  OpeningDetail,
} from "@repo/api/domains/openings/schemas/opening-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
import { Label } from "@repo/web/components/ui/label";
import { toast } from "@repo/web/components/ui/sonner";
import { Tabs, TabsList, TabsTrigger } from "@repo/web/components/ui/tabs";
import { Textarea } from "@repo/web/components/ui/textarea";

import { CoverLetterPrep } from "~/domains/applications/components/cover-letter-prep";
import { CreditCost } from "~/domains/credits/components/credit-cost";
import { useCredits } from "~/domains/credits/hooks/use-credits";
import { ResumeWorkspace } from "~/domains/documents/components/resume-workspace";
import { useOpeningDocuments } from "~/domains/documents/hooks/use-opening-documents";
import { AiAtWork } from "~/domains/workspace/components/ai-at-work";
import { useTRPC } from "~/tools/trpc/client";

import { useOpening, useRefreshOpenings } from "../hooks/use-opening";
import { useOpeningLabels } from "../hooks/use-opening-labels";

/** The opening itself: its status, description and the gap questions. */
export function OpeningView({ openingId }: { openingId: string }) {
  const t = useTranslation();
  const labels = useOpeningLabels();
  const trpc = useTRPC();
  const refresh = useRefreshOpenings();
  const opening = useOpening(openingId);
  const documents = useOpeningDocuments(openingId);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = searchParams.get("view");
  const view =
    requested === "resume" || requested === "letter" ? requested : "opening";
  const setView = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("view", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const credits = useCredits();
  const analyze = useMutation(
    trpc.openings.analyzeExternal.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );
  const setClosed = useMutation(
    trpc.openings.setClosed.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );

  // The sidebar's list learns the title once the analysis ends.
  const status = opening.data?.status;
  useEffect(() => {
    if (status && status !== "processing") void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (!opening.data) return null;
  const data = opening.data;

  if (data.status === "processing") {
    const found = data.progress?.counts;
    return (
      <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center p-6">
        <AiAtWork
          title={t.formatMessage({
            defaultMessage: "Reading the opening and checking your fit",
          })}
          current={data.progress?.label ?? "reading"}
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

  const gaps = data.fitCheck?.items.filter((item) => item.gapQuestion) ?? [];
  const resumeDocument = documents.data?.documents.find(
    (document) => document.kind === "resume"
  );
  const resumeVersions = resumeDocument?.versions ?? [];
  const tone =
    documents.data?.application?.tone ?? data.suggestedTone ?? "your_style";
  const tabs = data.status === "analyzed" && (
    <Tabs value={view} onValueChange={setView}>
      <TabsList>
        <TabsTrigger value="opening">
          {t.formatMessage({ defaultMessage: "Opening" })}
        </TabsTrigger>
        {resumeVersions.length > 0 && (
          <TabsTrigger value="resume">
            {t.formatMessage({ defaultMessage: "Resume" })}
          </TabsTrigger>
        )}
        <TabsTrigger value="letter">
          {t.formatMessage({ defaultMessage: "Cover letter" })}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  // A document opens in the workspace, which takes the whole column.
  if (
    data.status === "analyzed" &&
    (view === "letter" || (view === "resume" && resumeVersions.length > 0))
  ) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-3 border-b px-4 py-2">
          {tabs}
          <span className="text-muted-foreground truncate text-sm">
            {[data.title, data.company].filter(Boolean).join(" · ")}
          </span>
        </div>
        {view === "letter" ? (
          <CoverLetterPrep
            openingId={openingId}
            defaultLanguage={data.language ?? "en-US"}
            defaultTone={tone}
          />
        ) : (
          <ResumeWorkspace
            versions={resumeVersions}
            generation={resumeDocument?.generation}
          />
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              {data.title ?? t.formatMessage({ defaultMessage: "Opening" })}
            </h2>
            <p className="text-muted-foreground text-sm">{data.company}</p>
          </div>
          <div className="flex items-center gap-2">
            {data.kind === "unsolicited" && (
              <Badge variant="outline">
                {t.formatMessage({ defaultMessage: "No vacancy" })}
              </Badge>
            )}
            {data.suggestedTone && (
              <Badge variant="secondary">
                {t.formatMessage(
                  { defaultMessage: "Suggested tone: {tone}" },
                  { tone: labels.tone(data.suggestedTone) }
                )}
              </Badge>
            )}
            {(data.status === "analyzed" || data.status === "closed") && (
              <Button
                size="sm"
                variant="outline"
                disabled={setClosed.isPending}
                onClick={() =>
                  setClosed.mutate({
                    openingId,
                    closed: data.status !== "closed",
                  })
                }
              >
                {data.status === "closed"
                  ? t.formatMessage({ defaultMessage: "Reopen" })
                  : t.formatMessage({ defaultMessage: "Close" })}
              </Button>
            )}
          </div>
        </div>

        {data.status === "external" && (
          <div className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
            <p>
              {t.formatMessage({
                defaultMessage:
                  "You applied to this opening outside StoryToRole, so it wasn’t analyzed. Analyze it to see your fit and write documents for it.",
              })}
            </p>
            {data.sourceUrl && (
              <a
                href={data.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary flex items-center gap-1 self-start hover:underline"
              >
                <ExternalLink className="size-3.5" />
                {t.formatMessage({ defaultMessage: "Open the opening’s page" })}
              </a>
            )}
            {data.description || data.sourceUrl ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="self-start"
                  disabled={analyze.isPending}
                  onClick={() => analyze.mutate({ openingId })}
                >
                  {t.formatMessage({ defaultMessage: "Analyze this opening" })}
                </Button>
                <CreditCost credits={credits.data?.estimates.fitCheck} />
              </div>
            ) : (
              <p className="text-muted-foreground">
                {t.formatMessage({
                  defaultMessage:
                    "Without its description or link, there is nothing to analyze.",
                })}
              </p>
            )}
          </div>
        )}

        {data.status === "rejected" && (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <p>{labels.rejection(data.rejectionReason)}</p>
            <Button asChild size="sm" variant="outline" className="self-start">
              <Link href="/app/openings/new">
                {t.formatMessage({ defaultMessage: "Add it again" })}
              </Link>
            </Button>
          </div>
        )}

        {tabs}

        {gaps.length > 0 && (
          <section className="flex flex-col gap-3">
            <div>
              <h3 className="font-medium">
                {t.formatMessage({
                  defaultMessage: "Before writing for this opening",
                })}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t.formatMessage({
                  defaultMessage:
                    "The opening asks for things your profile doesn't show yet. Tell us if you really lack them, or share a story.",
                })}
              </p>
            </div>
            {gaps.map((item) => (
              <GapQuestion
                key={item.id}
                fitCheckItemId={item.id}
                question={item.gapQuestion ?? ""}
                answer={item.gapAnswer}
                lacks={item.gapLack}
                links={item.gapLinks}
                positions={data.fitCheck?.positions ?? []}
                projects={data.fitCheck?.projects ?? []}
              />
            ))}
          </section>
        )}

        {data.sourceUrl && (
          <a
            href={data.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground inline-flex items-center gap-1 text-sm underline"
          >
            <ExternalLink className="size-3.5" />
            {t.formatMessage({ defaultMessage: "Opening text" })}
          </a>
        )}

        {(data.description ?? data.notes) && (
          <section className="flex flex-col gap-2">
            <h3 className="font-medium">
              {data.description
                ? t.formatMessage({ defaultMessage: "Description" })
                : t.formatMessage({ defaultMessage: "Notes" })}
            </h3>
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">
              {data.description ?? data.notes}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function GapQuestion({
  fitCheckItemId,
  question,
  answer,
  lacks,
  links,
  positions,
  projects,
}: {
  fitCheckItemId: string;
  question: string;
  answer: string | null;
  /** The user confirmed they lack it: a suggestion went to their profile. */
  lacks: boolean;
  links: FitCheckItemView["gapLinks"];
  positions: NonNullable<OpeningDetail["fitCheck"]>["positions"];
  projects: NonNullable<OpeningDetail["fitCheck"]>["projects"];
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshOpenings();
  const [draft, setDraft] = useState(answer ?? "");
  // “I have it” asks where; “I don't have it” asks nothing more.
  const [mode, setMode] = useState<"have" | "lack">(lacks ? "lack" : "have");
  // The user changed their mind after confirming they lack it.
  const [reopened, setReopened] = useState(false);
  // A checkbox wrapped in its label toggled twice per click (the label
  // clicks it again): each gets an id its label points at instead.
  const gapId = useId();
  const [positionIds, setPositionIds] = useState<string[]>(
    links?.positionIds ?? []
  );
  const [projectIds, setProjectIds] = useState<string[]>(
    links?.projectIds ?? []
  );
  const [notTied, setNotTied] = useState(links?.notTied ?? false);
  const [sent, setSent] = useState(false);
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
  const tied = positionIds.length + projectIds.length > 0 || notTied;
  const save = useMutation(
    trpc.openings.answerGapQuestion.mutationOptions({
      onSuccess: async (result, input) => {
        await refresh();
        setReopened(false);
        setSent(!input.lacks && result.profileSuggestionIds.length > 0);
        toast.success(
          input.lacks
            ? result.profileSuggestionIds.length > 0
              ? t.formatMessage({
                  defaultMessage:
                    "Noted. A suggestion waits for you in My career.",
                })
              : t.formatMessage({ defaultMessage: "Noted for this opening." })
            : t.formatMessage({
                defaultMessage: "Answer saved for this opening.",
              })
        );
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const myCareer = (
    <Link href="/app/career" className="underline">
      {t.formatMessage({ defaultMessage: "Open My career" })}
    </Link>
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-sm">{question}</p>
      {lacks && !reopened ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-muted-foreground flex flex-wrap gap-x-1 text-xs">
            <span>
              {t.formatMessage({
                defaultMessage:
                  "You said you don't have it. A suggestion was sent to My career.",
              })}
            </span>
            {myCareer}
          </p>
          <Button size="sm" variant="ghost" onClick={() => setReopened(true)}>
            {t.formatMessage({ defaultMessage: "Answer instead" })}
          </Button>
        </div>
      ) : (
        <>
          {lacks && (
            <p className="text-muted-foreground text-xs">
              {t.formatMessage({
                defaultMessage:
                  "The suggestion already sent stays in My career until you reject it there.",
              })}
            </p>
          )}
          <Textarea
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              mode === "have"
                ? t.formatMessage({ defaultMessage: "Tell us what you did" })
                : t.formatMessage({
                    defaultMessage: "Optional: say it in your own words",
                  })
            }
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === "have" ? "secondary" : "ghost"}
              onClick={() => setMode("have")}
            >
              {t.formatMessage({ defaultMessage: "I have it" })}
            </Button>
            <Button
              size="sm"
              variant={mode === "lack" ? "secondary" : "ghost"}
              onClick={() => setMode("lack")}
            >
              {t.formatMessage({ defaultMessage: "I don't have it" })}
            </Button>
          </div>
          {mode === "have" ? (
            <div className="grid gap-2 rounded-md border p-2.5">
              <Label>
                {t.formatMessage({ defaultMessage: "Where did you do it?" })}
              </Label>
              {positions.map((position) => (
                <div
                  key={position.positionId}
                  className="flex items-center gap-2"
                >
                  <Checkbox
                    id={`${gapId}-${position.positionId}`}
                    checked={positionIds.includes(position.positionId)}
                    onCheckedChange={() =>
                      setPositionIds(toggle(positionIds, position.positionId))
                    }
                  />
                  <Label
                    htmlFor={`${gapId}-${position.positionId}`}
                    className="font-normal"
                  >
                    {t.formatMessage(
                      { defaultMessage: "{title} at {employer}" },
                      { title: position.title, employer: position.employer }
                    )}
                  </Label>
                </div>
              ))}
              {projects.map((project) => (
                <div
                  key={project.projectId}
                  className="flex items-center gap-2"
                >
                  <Checkbox
                    id={`${gapId}-${project.projectId}`}
                    checked={projectIds.includes(project.projectId)}
                    onCheckedChange={() =>
                      setProjectIds(toggle(projectIds, project.projectId))
                    }
                  />
                  <Label
                    htmlFor={`${gapId}-${project.projectId}`}
                    className="font-normal"
                  >
                    {t.formatMessage(
                      { defaultMessage: "{name} (project)" },
                      { name: project.name }
                    )}
                  </Label>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${gapId}-not-tied`}
                  checked={notTied}
                  onCheckedChange={(checked) => setNotTied(checked === true)}
                />
                <Label htmlFor={`${gapId}-not-tied`} className="font-normal">
                  {t.formatMessage({
                    defaultMessage: "Not tied to a position",
                  })}
                </Label>
              </div>
              <p className="text-muted-foreground text-xs">
                {t.formatMessage({
                  defaultMessage:
                    "A suggestion adds your answer to each one you pick, for you to accept in My career.",
                })}
              </p>
              <Button
                size="sm"
                className="self-start"
                disabled={!draft.trim() || !tied || save.isPending}
                onClick={() =>
                  save.mutate({
                    fitCheckItemId,
                    answer: draft.trim(),
                    positionIds,
                    projectIds,
                    notTied,
                  })
                }
              >
                {t.formatMessage({ defaultMessage: "Save answer" })}
              </Button>
              {(sent || (answer && tied)) && (
                <p className="text-muted-foreground flex flex-wrap gap-x-1 text-xs">
                  <span>
                    {t.formatMessage({
                      defaultMessage:
                        "Sent to your profile — accept it in My career.",
                    })}
                  </span>
                  {myCareer}
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-1.5 rounded-md border p-2.5">
              <p className="text-muted-foreground text-xs">
                {t.formatMessage({
                  defaultMessage:
                    "The suggestion goes to your profile's known gaps.",
                })}
              </p>
              <Button
                size="sm"
                className="self-start"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({
                    fitCheckItemId,
                    lacks: true,
                    answer: draft.trim() || undefined,
                  })
                }
              >
                {t.formatMessage({ defaultMessage: "Confirm I don't have it" })}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
