"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import { cn } from "@repo/web/lib/utils";

import { NewOpeningForm } from "~/domains/openings/components/new-opening-form";
import { useTRPC } from "~/tools/trpc/client";

import { useTimeline } from "../hooks/use-career-queries";
import { ApproveImportedButton } from "./approve-imported-button";
import { Sources } from "./sources";
import { PrivacyNotice } from "./privacy-notice";

/**
 * "I have an opening in mind" (workspace spec, "Onboarding"; ADR 0006):
 * the current resume or truth file first, so the fit check (which reads
 * approved positions and runs once) has something to judge, or an
 * explicit "I don't have one"; then the opening, whose page shows the fit
 * check, asks about what the opening needs and writes the resume.
 */
export function GuidedOpeningStart() {
  const t = useTranslation();
  const trpc = useTRPC();
  const router = useRouter();
  const timeline = useTimeline();
  const [step, setStep] = useState<"resume" | "no_resume" | "opening">(
    "resume"
  );
  const switchPath = useMutation(
    trpc.career.chooseStart.mutationOptions({
      onSuccess: () => router.push("/app/career"),
      onError: (error) => toast.error(error.message),
    })
  );
  if (!timeline.data) return null;
  const { profile, documents, positions } = timeline.data;

  const reading = documents.some(
    (document) =>
      document.status === "pending" || document.status === "processing"
  );
  const approved = positions.filter(
    (position) => position.status === "approved"
  );
  const waiting = positions.filter(
    (position) => position.status !== "approved"
  );
  // The opening waits for something the fit check can use.
  const ready = !reading && approved.length > 0;

  const steps = [
    {
      key: "resume",
      label: t.formatMessage({ defaultMessage: "Your resume" }),
    },
    {
      key: "opening",
      label: t.formatMessage({ defaultMessage: "The opening" }),
    },
  ] as const;
  const current = step === "opening" ? "opening" : "resume";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ol className="flex items-center gap-2 text-sm">
          {steps.map((item, index) => (
            <li
              key={item.key}
              className={cn(
                "flex items-center gap-2",
                item.key === current ? "font-medium" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-xs",
                  item.key === current &&
                    "border-primary bg-primary text-primary-foreground"
                )}
              >
                {index + 1}
              </span>
              {item.label}
            </li>
          ))}
        </ol>
        <Button
          size="sm"
          variant="ghost"
          disabled={switchPath.isPending}
          onClick={() => switchPath.mutate({ path: "career" })}
        >
          {t.formatMessage({
            defaultMessage: "Organize my career first instead",
          })}
        </Button>
      </div>

      {step === "resume" &&
        // The privacy notice comes only now, when career data is about to
        // arrive (workspace spec: "only when needed").
        (!profile.privacyNoticeAccepted ? (
          <PrivacyNotice />
        ) : (
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                {t.formatMessage({ defaultMessage: "Your current resume" })}
              </h2>
              <p className="text-muted-foreground text-sm">
                {t.formatMessage({
                  defaultMessage:
                    "Import your resume, your LinkedIn PDF or a text file about your career: it fills your career timeline, so the fit check has something to go on.",
                })}
              </p>
            </div>
            <Sources documents={documents} />
            {!reading && waiting.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
                <p>
                  {t.formatMessage(
                    {
                      defaultMessage:
                        "{count, plural, one {# position} other {# positions}} found. Approve them so the fit check can use them; you can review each one later in My career.",
                    },
                    { count: waiting.length }
                  )}
                </p>
                <ApproveImportedButton positions={positions} />
                {approved.length > 0 && (
                  <p className="text-muted-foreground text-xs">
                    {t.formatMessage({
                      defaultMessage:
                        "Positions whose details disagree between your files wait for you in My career.",
                    })}
                  </p>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {documents.length > 0 ? (
                <Button disabled={!ready} onClick={() => setStep("opening")}>
                  {t.formatMessage({
                    defaultMessage: "Continue to the opening",
                  })}
                  <ArrowRight />
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setStep("no_resume")}>
                  {t.formatMessage({ defaultMessage: "I don’t have a resume" })}
                </Button>
              )}
            </div>
          </section>
        ))}

      {step === "no_resume" && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            {t.formatMessage({ defaultMessage: "No resume yet" })}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t.formatMessage({
              defaultMessage:
                "That’s fine. A short interview about what you want to work with and the experiences you have (projects, studies, volunteering, freelance work) gives the fit check something to go on. Or add the opening now: the fit check will show every requirement as a gap, and its questions fill them in.",
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/app/career">
                {t.formatMessage({
                  defaultMessage: "Start the short interview",
                })}
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setStep("opening")}>
              {t.formatMessage({ defaultMessage: "Add the opening now" })}
            </Button>
          </div>
        </section>
      )}

      {step === "opening" && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              {t.formatMessage({ defaultMessage: "The opening" })}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t.formatMessage({
                defaultMessage:
                  "Paste it or its link. You’ll see how you fit right away, answer a few questions about what it needs, and get your resume.",
              })}
            </p>
          </div>
          <NewOpeningForm embedded />
          <Button
            variant="ghost"
            className="self-start"
            onClick={() => setStep("resume")}
          >
            {t.formatMessage({ defaultMessage: "Back to your resume" })}
          </Button>
        </section>
      )}
    </div>
  );
}
