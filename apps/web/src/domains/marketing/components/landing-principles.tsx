import { Ban, CircleCheck, Send, Tags, Zap } from "lucide-react";

import { getTranslation } from "@repo/intl/get-translation";
import type { Locale } from "@repo/intl/intl-config";

import { LandingContainer, SectionHeading } from "./section-heading";

/** The product's rules (ADR 0001, 0008): never invent, the user approves. */
export async function LandingPrinciples({ locale }: { locale: Locale }) {
  const t = await getTranslation(locale);
  const rules = [
    {
      title: t.formatMessage({
        defaultMessage: "It reorders, summarizes, translates",
      }),
      text: t.formatMessage({
        defaultMessage:
          "The AI may choose what matters for each opening and say it better. It may not add a title, a number, a technology or a certification your profile doesn't state.",
      }),
    },
    {
      title: t.formatMessage({ defaultMessage: "A missing fact is a gap" }),
      text: t.formatMessage({
        defaultMessage:
          "What an opening asks for and your profile doesn't show is declared as a gap, never filled in. You decide whether to answer it.",
      }),
    },
    {
      title: t.formatMessage({ defaultMessage: "You approve every change" }),
      text: t.formatMessage({
        defaultMessage:
          "Nothing the AI proposes reaches your profile until you accept it, and nothing is ever sent in your name.",
      }),
    },
    {
      title: t.formatMessage({ defaultMessage: "It warns, you decide" }),
      text: t.formatMessage({
        defaultMessage:
          "Edit the document however you want. The coverage review points out what the profile doesn't back, and you can still generate the PDF.",
      }),
    },
  ];
  const nots = [
    {
      icon: Zap,
      text: t.formatMessage({ defaultMessage: "No mass applying" }),
    },
    {
      icon: Send,
      text: t.formatMessage({ defaultMessage: "No auto-submitting" }),
    },
    {
      icon: Tags,
      text: t.formatMessage({ defaultMessage: "No keyword stuffing" }),
    },
  ];

  return (
    <section
      id="never-invents"
      className="bg-muted/60 scroll-mt-14 border-y py-16 md:py-24"
    >
      <LandingContainer className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <div className="flex flex-col gap-8 lg:sticky lg:top-24">
          <SectionHeading
            align="start"
            eyebrow={t.formatMessage({ defaultMessage: "Never invents" })}
            title={t.formatMessage({
              defaultMessage: "Every line traces back to something you did",
            })}
            lead={t.formatMessage({
              defaultMessage:
                "A resume you can defend in the interview, because every sentence comes from your own profile.",
            })}
          />
          <div className="bg-card flex flex-col gap-3 rounded-xl border p-5">
            <span className="text-sm font-medium">
              {t.formatMessage({ defaultMessage: "What StoryToRole is not" })}
            </span>
            <ul className="flex flex-col gap-2">
              {nots.map((item) => (
                <li
                  key={item.text}
                  className="text-muted-foreground flex items-center gap-2 text-sm"
                >
                  <Ban className="text-destructive size-4 shrink-0" />
                  <item.icon className="size-4 shrink-0" />
                  {item.text}
                </li>
              ))}
            </ul>
            <p className="text-sm text-pretty">
              {t.formatMessage({
                defaultMessage:
                  "Fewer, stronger applications, in your own voice.",
              })}
            </p>
          </div>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {rules.map((rule) => (
            <li
              key={rule.title}
              className="bg-card flex flex-col gap-2 rounded-xl border p-5 shadow-sm"
            >
              <CircleCheck className="text-brand-accent size-5" />
              <h3 className="font-medium">{rule.title}</h3>
              <p className="text-muted-foreground text-sm text-pretty">
                {rule.text}
              </p>
            </li>
          ))}
        </ul>
      </LandingContainer>
    </section>
  );
}
