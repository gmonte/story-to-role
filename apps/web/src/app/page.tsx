import type { Metadata } from "next";

import { getTranslation } from "@repo/intl/get-translation";

import { LandingComparison } from "~/domains/marketing/components/landing-comparison";
import { LandingFaq } from "~/domains/marketing/components/landing-faq";
import { LandingFooter } from "~/domains/marketing/components/landing-footer";
import { LandingHeader } from "~/domains/marketing/components/landing-header";
import { LandingHero } from "~/domains/marketing/components/landing-hero";
import { LandingPricing } from "~/domains/marketing/components/landing-pricing";
import { LandingPrinciples } from "~/domains/marketing/components/landing-principles";
import { LandingPrivacy } from "~/domains/marketing/components/landing-privacy";
import { LandingProblems } from "~/domains/marketing/components/landing-problems";
import { LandingShowcase } from "~/domains/marketing/components/landing-showcase";
import { LandingSteps } from "~/domains/marketing/components/landing-steps";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromNextCookies();
  const t = await getTranslation(locale);
  const title = t.formatMessage({
    defaultMessage: "StoryToRole · Resumes that never invent",
  });
  const description = t.formatMessage({
    defaultMessage:
      "Write your career once with an agent, check your fit for each opening and get resumes and cover letters in Portuguese and English that never invent.",
  });

  return {
    title,
    description,
    openGraph: { title, description, type: "website", siteName: "StoryToRole" },
  };
}

/** The public landing page; signed-in visitors see it too, with a way in. */
export default async function HomePage() {
  const locale = await getLocaleFromNextCookies();

  return (
    <div className="bg-background flex min-h-svh flex-col">
      <LandingHeader locale={locale} />
      <main className="flex-1">
        <LandingHero locale={locale} />
        <LandingProblems locale={locale} />
        <LandingSteps locale={locale} />
        <LandingShowcase locale={locale} />
        <LandingPrinciples locale={locale} />
        <LandingPrivacy locale={locale} />
        <LandingComparison locale={locale} />
        <LandingPricing locale={locale} />
        <LandingFaq locale={locale} />
      </main>
      <LandingFooter locale={locale} />
    </div>
  );
}
