import type { ReactNode } from "react";

import { Check, Sparkles, X } from "lucide-react";

import { getTranslation } from "@repo/intl/get-translation";
import type { Locale } from "@repo/intl/intl-config";
import { Badge } from "@repo/web/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/web/components/ui/tabs";
import { cn } from "@repo/web/lib/utils";

import { LandingContainer, SectionHeading } from "./section-heading";

type Translation = Awaited<ReturnType<typeof getTranslation>>;

// The example's fictional person; a name is never translated.
const EXAMPLE_NAME = "Ana Souza";

/**
 * The product's screens, one per tab, drawn with the workspace's own
 * components and fictional data, so they follow the theme and the language.
 */
export async function LandingShowcase({ locale }: { locale: Locale }) {
  const t = await getTranslation(locale);
  const tabs = [
    {
      value: "profile",
      label: t.formatMessage({ defaultMessage: "Profile" }),
      caption: t.formatMessage({
        defaultMessage:
          "The agent suggests; you accept or decline. Nothing reaches your profile without you.",
      }),
      screen: <ProfileScreen t={t} />,
    },
    {
      value: "fit",
      label: t.formatMessage({ defaultMessage: "Fit check" }),
      caption: t.formatMessage({
        defaultMessage:
          "Every requirement of the opening against your profile, with the evidence behind each answer.",
      }),
      screen: <FitScreen t={t} />,
    },
    {
      value: "document",
      label: t.formatMessage({ defaultMessage: "Resume" }),
      caption: t.formatMessage({
        defaultMessage:
          "A resume tailored to the opening, every line marked with where it came from.",
      }),
      screen: <DocumentScreen t={t} />,
    },
    {
      value: "applications",
      label: t.formatMessage({ defaultMessage: "Applications" }),
      caption: t.formatMessage({
        defaultMessage:
          "Every opening on one board, from analyzed to interview, with no spreadsheet.",
      }),
      screen: <ApplicationsScreen t={t} />,
    },
    {
      value: "linkedin",
      label: t.formatMessage({ defaultMessage: "LinkedIn" }),
      caption: t.formatMessage({
        defaultMessage:
          "Headline and About written from the same profile, so LinkedIn never contradicts your resume.",
      }),
      screen: <LinkedInScreen t={t} />,
    },
  ];

  return (
    <section className="py-16 md:py-24">
      <LandingContainer className="flex flex-col gap-10">
        <SectionHeading
          eyebrow={t.formatMessage({ defaultMessage: "See it in action" })}
          title={t.formatMessage({
            defaultMessage: "What you get, on a real opening",
          })}
          lead={t.formatMessage({
            defaultMessage: "Example data; names are fictional.",
          })}
        />
        <Tabs defaultValue="profile" className="items-center gap-6">
          <TabsList className="h-auto max-w-full flex-wrap justify-center">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent
              key={tab.value}
              value={tab.value}
              className="flex w-full flex-col items-center gap-4"
            >
              <div className="bg-muted/60 w-full overflow-hidden rounded-xl border p-2 shadow-lg sm:p-3">
                <div className="bg-background h-[26rem] overflow-hidden rounded-lg border sm:h-[28rem]">
                  {tab.screen}
                </div>
              </div>
              <p className="text-muted-foreground max-w-xl text-center text-sm text-pretty">
                {tab.caption}
              </p>
            </TabsContent>
          ))}
        </Tabs>
      </LandingContainer>
    </section>
  );
}

function ScreenBar({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-11 items-center gap-2 border-b px-4">
      <span className="truncate text-sm font-medium">{title}</span>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}

function ProfileScreen({ t }: { t: Translation }) {
  const index = [
    t.formatMessage({ defaultMessage: "Professional identity" }),
    t.formatMessage({ defaultMessage: "Contact" }),
    t.formatMessage({ defaultMessage: "Experience" }),
    t.formatMessage({ defaultMessage: "Education" }),
    t.formatMessage({ defaultMessage: "Skills" }),
    t.formatMessage({ defaultMessage: "Known gaps" }),
  ];

  return (
    <div className="flex h-full flex-col">
      <ScreenBar title={t.formatMessage({ defaultMessage: "My career" })}>
        <Badge variant="secondary">
          {t.formatMessage({ defaultMessage: "Version 4 published" })}
        </Badge>
      </ScreenBar>
      <div className="flex min-h-0 flex-1">
        <div className="bg-muted/60 hidden w-48 shrink-0 flex-col gap-1 border-r p-3 text-sm sm:flex">
          <span className="text-muted-foreground mb-1 text-xs font-medium uppercase">
            {t.formatMessage({ defaultMessage: "Index" })}
          </span>
          {index.map((item, position) => (
            <span
              key={item}
              className={cn(
                "rounded-md px-2 py-1",
                position === 2 && "bg-accent font-medium"
              )}
            >
              {item}
            </span>
          ))}
        </div>
        <div className="bg-card min-w-0 flex-1 overflow-hidden p-5 text-sm sm:p-6">
          <h3 className="font-display mb-1 text-lg font-semibold">
            {t.formatMessage({ defaultMessage: "Experience" })}
          </h3>
          <p className="mb-3 font-medium">
            {t.formatMessage({
              defaultMessage:
                "Aurora Payments — Backend Developer (2021-03 to present)",
            })}
          </p>
          <ul className="text-muted-foreground flex list-disc flex-col gap-1.5 pl-5">
            <li>
              {t.formatMessage({
                defaultMessage:
                  "Context: B2B payments platform, team of 8, 2 million invoices a month.",
              })}
            </li>
            <li>
              <span className="text-foreground mr-1">
                {t.formatMessage({
                  defaultMessage:
                    "I moved monthly billing off a nightly batch to an event queue (Python, SQS).",
                })}
              </span>
              <span className="rounded bg-emerald-500/15 px-1 text-emerald-800 dark:text-emerald-300">
                {t.formatMessage({
                  defaultMessage:
                    "Closing run went from 6 hours to 40 minutes [measured: job log].",
                })}
              </span>
            </li>
            <li>
              {t.formatMessage({
                defaultMessage:
                  "I didn't lead the team; I reviewed code for two juniors.",
              })}
            </li>
          </ul>
          <div className="bg-background mt-4 flex flex-col gap-2 rounded-lg border p-3">
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <Sparkles className="text-brand-accent size-3.5" />
              {t.formatMessage({ defaultMessage: "Profile agent" })}
            </span>
            <p className="text-muted-foreground text-xs">
              {t.formatMessage({
                defaultMessage:
                  "You said the closing run got faster. How much, and how do you know?",
              })}
            </p>
            <div className="flex gap-2">
              <span className="bg-primary text-primary-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs">
                <Check className="size-3" />
                {t.formatMessage({ defaultMessage: "Accept" })}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                <X className="size-3" />
                {t.formatMessage({ defaultMessage: "Decline" })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FitScreen({ t }: { t: Translation }) {
  const rows = [
    {
      status: "met",
      requirement: t.formatMessage({ defaultMessage: "Python and REST APIs" }),
      evidence: t.formatMessage({
        defaultMessage: "Aurora Payments: billing services in Python, FastAPI.",
      }),
    },
    {
      status: "met",
      requirement: t.formatMessage({
        defaultMessage: "Event-driven architecture",
      }),
      evidence: t.formatMessage({
        defaultMessage: "Aurora Payments: you moved billing to an event queue.",
      }),
    },
    {
      status: "partial",
      requirement: t.formatMessage({
        defaultMessage: "Kubernetes in production",
      }),
      evidence: t.formatMessage({
        defaultMessage:
          "You deployed with Docker; no Kubernetes in your profile.",
      }),
    },
    {
      status: "gap",
      requirement: t.formatMessage({ defaultMessage: "Go" }),
      evidence: t.formatMessage({
        defaultMessage: "Not in your profile. It stays out of the resume.",
      }),
    },
  ] as const;
  const label = {
    met: t.formatMessage({ defaultMessage: "Met" }),
    partial: t.formatMessage({ defaultMessage: "Partial" }),
    gap: t.formatMessage({ defaultMessage: "Gap" }),
  };
  const tone = {
    met: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
    partial: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
    gap: "bg-red-500/15 text-red-800 dark:text-red-300",
  };

  return (
    <div className="flex h-full flex-col">
      <ScreenBar
        title={t.formatMessage({
          defaultMessage: "Senior Backend Engineer · Fintech Nimbus",
        })}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <span className="font-medium">
            {t.formatMessage({ defaultMessage: "High fit" })}
          </span>
          <Badge variant="secondary">
            {t.formatMessage({ defaultMessage: "7 met" })}
          </Badge>
          <Badge variant="secondary">
            {t.formatMessage({ defaultMessage: "1 partial" })}
          </Badge>
          <Badge variant="secondary">
            {t.formatMessage({ defaultMessage: "1 gap" })}
          </Badge>
          <span className="text-muted-foreground ml-auto text-xs">
            {t.formatMessage({
              defaultMessage: "Within your preferences: remote, CLT or PJ",
            })}
          </span>
        </div>
        {rows.map((row) => (
          <div
            key={row.requirement}
            className="bg-card flex flex-col gap-1 rounded-lg border p-3 text-sm"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-xs font-medium",
                  tone[row.status]
                )}
              >
                {label[row.status]}
              </span>
              <span className="font-medium">{row.requirement}</span>
            </div>
            <p className="text-muted-foreground text-xs">{row.evidence}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentScreen({ t }: { t: Translation }) {
  return (
    <div className="flex h-full flex-col">
      <ScreenBar
        title={t.formatMessage({ defaultMessage: "Resume · English" })}
      >
        <Badge>
          {t.formatMessage({ defaultMessage: "Resume score 9/10" })}
        </Badge>
      </ScreenBar>
      <div className="bg-muted/60 flex min-h-0 flex-1 justify-center overflow-hidden p-4 sm:p-6">
        <div className="bg-card w-full max-w-xl rounded-sm border p-6 text-sm shadow-md">
          <p className="text-doc-accent text-xl font-semibold">
            {EXAMPLE_NAME}
          </p>
          <p className="text-muted-foreground mb-4 text-xs">
            {t.formatMessage({
              defaultMessage:
                "Backend Engineer · Python, FastAPI, PostgreSQL · Belo Horizonte, Brazil",
            })}
          </p>
          <p className="border-doc-accent/40 text-doc-accent mb-1 border-b text-xs font-semibold tracking-wider uppercase">
            {t.formatMessage({ defaultMessage: "Experience" })}
          </p>
          <p className="mt-2 font-medium">
            {t.formatMessage({
              defaultMessage:
                "Aurora Payments — Backend Developer · 2021–present",
            })}
          </p>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
            <li className="border-l-2 border-emerald-500 pl-2">
              {t.formatMessage({
                defaultMessage:
                  "Moved monthly billing from a nightly batch to an event-driven queue in Python, cutting the closing run from 6 hours to 40 minutes.",
              })}
            </li>
            <li className="border-l-2 border-emerald-500 pl-2">
              {t.formatMessage({
                defaultMessage:
                  "Built REST APIs in FastAPI for recurring billing on a B2B payments platform.",
              })}
            </li>
            <li className="border-l-2 border-sky-500 pl-2">
              {t.formatMessage({
                defaultMessage:
                  "Reviewed code and mentored two junior developers.",
              })}
            </li>
          </ul>
          <div className="text-muted-foreground mt-4 flex flex-wrap gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-emerald-500" />
              {t.formatMessage({ defaultMessage: "From your profile" })}
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-sky-500" />
              {t.formatMessage({ defaultMessage: "Edited by you" })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApplicationsScreen({ t }: { t: Translation }) {
  const columns = [
    {
      title: t.formatMessage({ defaultMessage: "Analyzed" }),
      dot: "bg-emerald-500",
      cards: ["Nimbus · Senior Backend", "Orbita · Platform Engineer"],
    },
    {
      title: t.formatMessage({ defaultMessage: "Preparing" }),
      dot: "bg-amber-500",
      cards: ["Lumen Bank · Backend Developer"],
    },
    {
      title: t.formatMessage({ defaultMessage: "Sent" }),
      dot: "bg-sky-500",
      cards: ["Vela Health · Python Engineer", "Kora · API Engineer"],
    },
    {
      title: t.formatMessage({ defaultMessage: "Interview" }),
      dot: "bg-violet-500",
      cards: ["Aster Pay · Senior Backend"],
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <ScreenBar title={t.formatMessage({ defaultMessage: "Applications" })} />
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-hidden p-4 md:grid-cols-4">
        {columns.map((column) => (
          <div
            key={column.title}
            className="bg-muted/60 flex flex-col gap-2 rounded-lg border p-2"
          >
            <span className="flex items-center gap-2 px-1 text-xs font-medium">
              <span className={cn("size-2 rounded-full", column.dot)} />
              {column.title}
              <span className="text-muted-foreground ml-auto">
                {t.formatNumber(column.cards.length)}
              </span>
            </span>
            {column.cards.map((card) => (
              <div
                key={card}
                className="bg-card rounded-md border p-2.5 text-xs shadow-xs"
              >
                <p className="font-medium">{card.split(" · ")[1]}</p>
                <p className="text-muted-foreground">{card.split(" · ")[0]}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function LinkedInScreen({ t }: { t: Translation }) {
  return (
    <div className="flex h-full flex-col">
      <ScreenBar title={t.formatMessage({ defaultMessage: "LinkedIn" })} />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase">
            {t.formatMessage({ defaultMessage: "Headline options" })}
          </span>
          {[
            t.formatMessage({
              defaultMessage:
                "Backend Engineer · Payments · Python, FastAPI, event-driven billing",
            }),
            t.formatMessage({
              defaultMessage:
                "Backend Developer building billing platforms that close on time",
            }),
          ].map((headline, position) => (
            <div
              key={headline}
              className={cn(
                "bg-card rounded-lg border p-3 text-sm",
                position === 0 &&
                  "border-brand-accent/50 ring-brand-accent/20 ring-2"
              )}
            >
              {headline}
            </div>
          ))}
        </div>
        <div className="bg-card flex flex-col gap-2 rounded-lg border p-4 text-sm">
          <span className="text-xs font-medium uppercase">
            {t.formatMessage({ defaultMessage: "About" })}
          </span>
          <p className="text-muted-foreground text-pretty">
            {t.formatMessage({
              defaultMessage:
                "I build the backend of payment products. At Aurora Payments I moved monthly billing to an event queue and cut the closing run from 6 hours to 40 minutes. I care about systems that are boring in production.",
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
