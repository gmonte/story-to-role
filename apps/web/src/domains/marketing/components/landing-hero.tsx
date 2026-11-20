import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { creditSettings } from "@repo/api/domains/credits/credit-pricing";
import { getTranslation } from "@repo/intl/get-translation";
import type { Locale } from "@repo/intl/intl-config";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";

import { HeroTraceDemo } from "./hero-trace-demo";
import { LandingContainer } from "./section-heading";

/** The promise in one line, the way in, and the product at work. */
export async function LandingHero({ locale }: { locale: Locale }) {
  const t = await getTranslation(locale);

  return (
    <section className="relative overflow-hidden border-b">
      {/* A faint dot grid that fades into the page. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] bg-size-[22px_22px]"
      />
      <div
        aria-hidden="true"
        className="from-background/40 via-background/80 to-background absolute inset-0 bg-linear-to-b"
      />
      <LandingContainer className="relative grid grid-cols-1 gap-12 py-16 md:py-24 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div className="flex flex-col items-start gap-6">
          <Badge variant="outline" className="bg-card gap-2 py-1">
            <span className="bg-brand-accent size-1.5 rounded-full" />
            {t.formatMessage({
              defaultMessage: "Resumes and cover letters that never invent",
            })}
          </Badge>
          <h1 className="font-display text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            {t.formatMessage({
              defaultMessage:
                "Your whole career, written once. Every resume, true to it.",
            })}
          </h1>
          <p className="text-muted-foreground max-w-xl text-lg text-pretty">
            {t.formatMessage({
              defaultMessage:
                "Write your career with an agent that asks what a recruiter would ask. StoryToRole checks your fit for each opening and writes the resume and cover letter from your profile alone, in Portuguese and English.",
            })}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/sign-up">
                {t.formatMessage({ defaultMessage: "Start free" })}
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="bg-card">
              <a href="#how-it-works">
                {t.formatMessage({ defaultMessage: "See how it works" })}
              </a>
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            {t.formatMessage(
              {
                defaultMessage:
                  "{credits} welcome credits · no card · cancel anytime",
              },
              { credits: t.formatNumber(creditSettings.welcomeCredits) }
            )}
          </p>
        </div>
        <HeroTraceDemo />
      </LandingContainer>
    </section>
  );
}
