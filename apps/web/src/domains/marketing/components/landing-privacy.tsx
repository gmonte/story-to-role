import {
  Brain,
  FileArchive,
  KeyRound,
  ScrollText,
  Timer,
  Trash2,
} from "lucide-react";

import { getTranslation } from "@repo/intl/get-translation";
import type { Locale } from "@repo/intl/intl-config";

import { LandingContainer, SectionHeading } from "./section-heading";

/** What the privacy spec promises, in plain words. */
export async function LandingPrivacy({ locale }: { locale: Locale }) {
  const t = await getTranslation(locale);
  const promises = [
    {
      icon: KeyRound,
      title: t.formatMessage({ defaultMessage: "Encrypted with your own key" }),
      text: t.formatMessage({
        defaultMessage:
          "Your career content is encrypted before it reaches the database, with a key that is yours alone.",
      }),
    },
    {
      icon: ScrollText,
      title: t.formatMessage({ defaultMessage: "No content in logs" }),
      text: t.formatMessage({
        defaultMessage:
          "Your profile and documents are never written to logs, and only the passages a step needs reach the AI.",
      }),
    },
    {
      icon: Brain,
      title: t.formatMessage({ defaultMessage: "Never used for training" }),
      text: t.formatMessage({
        defaultMessage:
          "The AI providers we use don't train models on API data, and we have no recruiter product or ad network.",
      }),
    },
    {
      icon: Timer,
      title: t.formatMessage({ defaultMessage: "Chats deleted in 7 days" }),
      text: t.formatMessage({
        defaultMessage:
          "The agent's messages are a working conversation: what matters ends up in your profile, and the rest is deleted.",
      }),
    },
    {
      icon: FileArchive,
      title: t.formatMessage({ defaultMessage: "Export everything" }),
      text: t.formatMessage({
        defaultMessage:
          "One button gives you a ZIP with your profile, every version, your applications and your PDFs.",
      }),
    },
    {
      icon: Trash2,
      title: t.formatMessage({ defaultMessage: "Delete at once" }),
      text: t.formatMessage({
        defaultMessage:
          "Deleting your account removes everything we hold right away. Nothing is kept to recognize you later.",
      }),
    },
  ];

  return (
    <section id="privacy" className="scroll-mt-14 py-16 md:py-24">
      <LandingContainer className="flex flex-col gap-12">
        <SectionHeading
          eyebrow={t.formatMessage({ defaultMessage: "Privacy" })}
          title={t.formatMessage({
            defaultMessage: "Your career history is yours",
          })}
          lead={t.formatMessage({
            defaultMessage:
              "Resumes, results, the things you'd only say in an interview. We keep only what the product needs, under Brazil's LGPD.",
          })}
        />
        <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {promises.map((promise) => (
            <li key={promise.title} className="flex gap-4">
              <span className="bg-card flex size-10 shrink-0 items-center justify-center rounded-lg border shadow-xs">
                <promise.icon className="text-brand-accent size-5" />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="font-medium">{promise.title}</h3>
                <p className="text-muted-foreground text-sm text-pretty">
                  {promise.text}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </LandingContainer>
    </section>
  );
}
