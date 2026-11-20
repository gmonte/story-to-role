import { Copy, Repeat, ShieldAlert } from "lucide-react";

import { getTranslation } from "@repo/intl/get-translation";
import type { Locale } from "@repo/intl/intl-config";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/web/components/ui/card";

import { LandingContainer, SectionHeading } from "./section-heading";

/** Why applying hurts today, in three cards. */
export async function LandingProblems({ locale }: { locale: Locale }) {
  const t = await getTranslation(locale);
  const problems = [
    {
      icon: Copy,
      title: t.formatMessage({
        defaultMessage: "Generic AI sounds like everyone else",
      }),
      text: t.formatMessage({
        defaultMessage:
          "Recruiters read hundreds of applications in the same polished, empty voice. Yours blends in.",
      }),
    },
    {
      icon: ShieldAlert,
      title: t.formatMessage({
        defaultMessage: "An invented line costs you the interview",
      }),
      text: t.formatMessage({
        defaultMessage:
          "AI that adds a skill or a number you never had puts you in front of a question you can't answer.",
      }),
    },
    {
      icon: Repeat,
      title: t.formatMessage({
        defaultMessage: "The same story, rewritten every time",
      }),
      text: t.formatMessage({
        defaultMessage:
          "Each opening means digging up old resumes, translating them and hoping nothing contradicts the last one.",
      }),
    },
  ];

  return (
    <section className="py-16 md:py-24">
      <LandingContainer className="flex flex-col gap-12">
        <SectionHeading
          eyebrow={t.formatMessage({ defaultMessage: "The problem" })}
          title={t.formatMessage({
            defaultMessage: "Most tools help you apply more, not better",
          })}
        />
        <div className="grid gap-4 md:grid-cols-3">
          {problems.map((problem) => (
            <Card key={problem.title} className="gap-4">
              <CardHeader className="gap-3">
                <span className="bg-muted flex size-10 items-center justify-center rounded-lg border">
                  <problem.icon className="text-muted-foreground size-5" />
                </span>
                <CardTitle className="text-base">{problem.title}</CardTitle>
                <CardDescription className="text-pretty">
                  {problem.text}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </LandingContainer>
    </section>
  );
}
