"use client";

import { useEffect, useState } from "react";

import { CircleCheck, FileText, Link2 } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Card } from "@repo/web/components/ui/card";
import { cn } from "@repo/web/lib/utils";

import { AiAtWork } from "~/domains/workspace/components/ai-at-work";

// One tick of the loop, in milliseconds, and how many ticks each step lasts;
// the writing step lasts as long as the bullet takes to type.
const tickMs = 40;
const stepTicks = 32;
const charsPerTick = 2;
const holdTicks = 110;
// The profile's file name (profile-truth spec), never translated.
const PROFILE_FILE = "profile_truth.md";

/**
 * The hero's loop: a passage of the profile, the AI at work on an opening,
 * and the resume bullet it writes, typed out, traced back to its source.
 * With reduced motion it shows the finished bullet and stays.
 */
export function HeroTraceDemo() {
  const t = useTranslation();
  const [tick, setTick] = useState<number | null>(null);

  const bullet = t.formatMessage({
    defaultMessage:
      "Moved monthly billing from a nightly batch to an event-driven queue in Python, cutting the closing run from 6 hours to 40 minutes.",
  });
  const writeTicks = Math.ceil(bullet.length / charsPerTick);
  const bounds = {
    read: stepTicks,
    pick: stepTicks * 2,
    write: stepTicks * 2 + writeTicks,
    check: stepTicks * 3 + writeTicks,
  };
  const cycle = bounds.check + holdTicks;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setTick((current) => ((current ?? 0) + 1) % cycle),
      tickMs
    );
    return () => window.clearInterval(timer);
  }, [cycle]);

  // Before the first tick (and with reduced motion) the loop rests finished.
  const at = tick ?? cycle - 1;
  const current =
    at < bounds.read
      ? "read"
      : at < bounds.pick
        ? "pick"
        : at < bounds.write
          ? "write"
          : at < bounds.check
            ? "check"
            : "done";
  const steps = [
    {
      key: "read",
      label: t.formatMessage({ defaultMessage: "Reading the opening" }),
    },
    {
      key: "pick",
      label: t.formatMessage({
        defaultMessage: "Choosing what your profile backs",
      }),
    },
    {
      key: "write",
      label: t.formatMessage({ defaultMessage: "Writing in your words" }),
    },
    {
      key: "check",
      label: t.formatMessage({
        defaultMessage: "Checking every fact against your profile",
      }),
    },
  ];
  const title =
    current === "done"
      ? t.formatMessage({ defaultMessage: "Done: every line has a source" })
      : t.formatMessage(
          { defaultMessage: "{step}…" },
          { step: steps.find((step) => step.key === current)?.label ?? "" }
        );
  const picked = current !== "read";
  const typed =
    current === "read" || current === "pick"
      ? ""
      : current === "write"
        ? bullet.slice(0, (at - bounds.pick) * charsPerTick)
        : bullet;
  const traced = current === "done";

  const sourceLines = [
    t.formatMessage({
      defaultMessage:
        "Moved monthly billing off a nightly batch to an event queue (Python, SQS).",
    }),
    t.formatMessage({
      defaultMessage:
        "Closing run went from 6 hours to 40 minutes [measured: job log].",
    }),
    t.formatMessage({
      defaultMessage: "Did not lead the team; reviewed code for two juniors.",
    }),
  ];

  return (
    <div className="relative">
      <p className="sr-only">
        {t.formatMessage({
          defaultMessage:
            "An example: a resume bullet written from two lines of the profile, each fact traced back to its source.",
        })}
      </p>
      <Card aria-hidden="true" className="gap-0 overflow-hidden p-0 shadow-lg">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <FileText className="text-muted-foreground size-4" />
          <span className="font-mono text-xs">{PROFILE_FILE}</span>
          <Badge variant="secondary" className="ml-auto">
            {t.formatMessage({ defaultMessage: "Experience" })}
          </Badge>
        </div>
        <div className="flex flex-col gap-1.5 px-4 py-3 text-sm">
          <p className="font-medium">
            {t.formatMessage({
              defaultMessage:
                "Aurora Payments — Backend Developer (2021-03 to present)",
            })}
          </p>
          {sourceLines.map((line, index) => (
            <p
              key={line}
              className={cn(
                "text-muted-foreground rounded-md border border-transparent px-2 py-1 transition-colors duration-500",
                picked &&
                  index < 2 &&
                  "border-brand-accent/40 bg-brand-accent/10 text-foreground"
              )}
            >
              {line}
            </p>
          ))}
        </div>
        <div className="bg-muted/60 border-y px-4 py-3">
          <AiAtWork
            title={title}
            steps={steps}
            current={current}
            className="bg-card"
          />
        </div>
        <div className="flex flex-col gap-2 px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-doc-accent text-xs font-semibold tracking-wider uppercase">
              {t.formatMessage({ defaultMessage: "Resume · Experience" })}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {t.formatMessage({
                defaultMessage: "Senior Backend Engineer · Fintech",
              })}
            </span>
          </div>
          <p className="min-h-16 text-sm leading-relaxed">
            <span className="bg-muted-foreground mr-2 inline-block size-1 rounded-full align-middle" />
            {typed}
            {current === "write" && (
              <span className="bg-foreground ml-0.5 inline-block h-4 w-px animate-pulse align-middle" />
            )}
          </p>
          <div
            className={cn(
              "flex flex-wrap items-center gap-2 transition-opacity duration-500",
              traced ? "opacity-100" : "opacity-0"
            )}
          >
            <Badge
              variant="outline"
              className="border-brand-accent/40 text-foreground gap-1"
            >
              <Link2 className="text-brand-accent" />
              {t.formatMessage({
                defaultMessage: "Source: Experience · Aurora Payments",
              })}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <CircleCheck className="text-emerald-600 dark:text-emerald-400" />
              {t.formatMessage({ defaultMessage: "Nothing added" })}
            </Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
