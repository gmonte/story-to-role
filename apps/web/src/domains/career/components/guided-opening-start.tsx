"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import { cn } from "@repo/web/lib/utils";

import { NewOpeningForm } from "~/domains/openings/components/new-opening-form";
import { useTRPC } from "~/tools/trpc/client";

import { useTimeline } from "../hooks/use-career-queries";
import { Sources } from "./sources";
import { PrivacyNotice } from "./privacy-notice";

/**
 * "I have an opening in mind" (workspace spec, "Onboarding"; ADR 0006):
 * the current resume or truth file first, kept with the sources, or an
 * explicit "I don't have one"; then the opening, whose page shows the fit
 * check, asks about what the opening needs and writes the resume. Until
 * profile_truth (P1 to P5, docs/plan.md) a source is only stored.
 */
export function GuidedOpeningStart() {
  const t = useTranslation();
  const trpc = useTRPC();
  const router = useRouter();
  const timeline = useTimeline();
  const [step, setStep] = useState<"resume" | "opening">("resume");
  const switchPath = useMutation(
    trpc.career.chooseStart.mutationOptions({
      onSuccess: () => router.push("/app/career"),
      onError: (error) => toast.error(error.message),
    })
  );
  if (!timeline.data) return null;
  const { profile, documents } = timeline.data;

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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ol className="flex items-center gap-2 text-sm">
          {steps.map((item, index) => (
            <li
              key={item.key}
              className={cn(
                "flex items-center gap-2",
                item.key === step ? "font-medium" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-xs",
                  item.key === step &&
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
                    "Upload your resume, your LinkedIn PDF or a text file about your career. It stays with your sources in My career.",
                })}
              </p>
            </div>
            <Sources documents={documents} />
            <div className="flex flex-wrap gap-2">
              {/* Either way on to the opening: only the wording differs. */}
              <Button
                variant={documents.length > 0 ? "default" : "ghost"}
                onClick={() => setStep("opening")}
              >
                {documents.length > 0 ? (
                  <>
                    {t.formatMessage({
                      defaultMessage: "Continue to the opening",
                    })}
                    <ArrowRight />
                  </>
                ) : (
                  t.formatMessage({ defaultMessage: "I don’t have a resume" })
                )}
              </Button>
            </div>
          </section>
        ))}

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
