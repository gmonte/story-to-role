"use client";

import { useState } from "react";

import { ArrowRight } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { cn } from "@repo/web/lib/utils";

import { NewOpeningForm } from "~/domains/openings/components/new-opening-form";

import { useTimeline } from "../hooks/use-career-queries";
import { ApproveImportedButton } from "./approve-imported-button";
import { ImportDocuments } from "./import-documents";
import { PrivacyNotice } from "./privacy-notice";

/**
 * "I have an opening in mind" (workspace spec, "Onboarding"): the current
 * resume or truth file first (or none), so the fit check has something to
 * judge; then the opening, whose page shows the fit check, asks about what
 * the opening needs and writes the resume.
 */
export function GuidedOpeningStart() {
  const t = useTranslation();
  const timeline = useTimeline();
  const [step, setStep] = useState<"resume" | "opening">("resume");
  if (!timeline.data) return null;
  const { profile, documents, positions } = timeline.data;
  const imported = positions.filter(
    (position) => position.status !== "approved"
  );

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

      {step === "resume" &&
        // The privacy notice comes only now, when career data is about to
        // arrive (workspace spec: "only when needed").
        (!profile.privacyNoticeAccepted ? (
          <PrivacyNotice interviewLanguage={profile.interviewLanguage} />
        ) : (
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                {t.formatMessage({ defaultMessage: "Your current resume" })}
              </h2>
              <p className="text-muted-foreground text-sm">
                {t.formatMessage({
                  defaultMessage:
                    "Import your resume or a truth file: it fills your career timeline, so the fit check has something to go on. You can also start without one.",
                })}
              </p>
            </div>
            <ImportDocuments documents={documents} />
            {imported.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
                <p>
                  {t.formatMessage(
                    {
                      defaultMessage:
                        "{count, plural, one {# position} other {# positions}} found. Approve them so the fit check can use them; you can review each one later in My career.",
                    },
                    { count: imported.length }
                  )}
                </p>
                <ApproveImportedButton />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setStep("opening")}>
                {t.formatMessage({ defaultMessage: "Continue to the opening" })}
                <ArrowRight />
              </Button>
              {documents.length === 0 && (
                <Button variant="ghost" onClick={() => setStep("opening")}>
                  {t.formatMessage({ defaultMessage: "I don’t have a resume" })}
                </Button>
              )}
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
          <NewOpeningForm />
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
