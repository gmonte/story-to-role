import { FileCheck2, Gauge, KanbanSquare, PenLine } from "lucide-react";

import { getTranslation } from "@repo/intl/get-translation";
import type { Locale } from "@repo/intl/intl-config";

import { LandingContainer, SectionHeading } from "./section-heading";

/** The method in four steps, from the profile to the application. */
export async function LandingSteps({ locale }: { locale: Locale }) {
  const t = await getTranslation(locale);
  const steps = [
    {
      icon: PenLine,
      title: t.formatMessage({ defaultMessage: "Write your profile" }),
      text: t.formatMessage({
        defaultMessage:
          "Start from the resume you have. The profile agent asks what a recruiter would ask and suggests changes you accept or decline.",
      }),
    },
    {
      icon: Gauge,
      title: t.formatMessage({ defaultMessage: "Check the fit" }),
      text: t.formatMessage({
        defaultMessage:
          "Paste an opening. The fit check shows what your profile meets, what it partly meets and what is missing, and your job preferences tell you when to skip.",
      }),
    },
    {
      icon: FileCheck2,
      title: t.formatMessage({
        defaultMessage: "Generate the resume and cover letter",
      }),
      text: t.formatMessage({
        defaultMessage:
          "Tailored to the opening, in Portuguese and English, with a coverage review that points out anything the profile doesn't back before you send it.",
      }),
    },
    {
      icon: KanbanSquare,
      title: t.formatMessage({ defaultMessage: "Track every application" }),
      text: t.formatMessage({
        defaultMessage:
          "Each opening moves from analyzed to sent to interview on a list or a board, and your LinkedIn stays in line with the same profile.",
      }),
    },
  ];

  return (
    <section
      id="how-it-works"
      className="bg-muted/60 scroll-mt-14 border-y py-16 md:py-24"
    >
      <LandingContainer className="flex flex-col gap-12">
        <SectionHeading
          eyebrow={t.formatMessage({ defaultMessage: "How it works" })}
          title={t.formatMessage({
            defaultMessage: "One profile, every application",
          })}
          lead={t.formatMessage({
            defaultMessage:
              "Your profile is the single source of truth. A fact changes there, never in each document.",
          })}
        />
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="bg-card flex flex-col gap-3 rounded-xl border p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
                  <step.icon className="size-4" />
                </span>
                <span className="font-display text-muted-foreground text-sm">
                  {t.formatNumber(index + 1, { minimumIntegerDigits: 2 })}
                </span>
              </div>
              <h3 className="font-medium">{step.title}</h3>
              <p className="text-muted-foreground text-sm text-pretty">
                {step.text}
              </p>
            </li>
          ))}
        </ol>
      </LandingContainer>
    </section>
  );
}
