import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { getTranslation } from "@repo/intl/get-translation";
import type { Locale } from "@repo/intl/intl-config";
import { Button } from "@repo/web/components/ui/button";
import { Separator } from "@repo/web/components/ui/separator";

import { BrandLockup } from "~/domains/brand/components/brand-lockup";

import { LandingContainer } from "./section-heading";

/** The closing call to action and the footer. */
export async function LandingFooter({ locale }: { locale: Locale }) {
  const t = await getTranslation(locale);
  const links = [
    {
      href: "#how-it-works",
      label: t.formatMessage({ defaultMessage: "How it works" }),
    },
    {
      href: "#never-invents",
      label: t.formatMessage({ defaultMessage: "Principles" }),
    },
    { href: "#privacy", label: t.formatMessage({ defaultMessage: "Privacy" }) },
    { href: "#pricing", label: t.formatMessage({ defaultMessage: "Pricing" }) },
    { href: "#faq", label: t.formatMessage({ defaultMessage: "FAQ" }) },
  ];

  return (
    <footer>
      <section className="py-16 md:py-24">
        <LandingContainer>
          <div className="bg-primary text-primary-foreground relative flex flex-col items-center gap-6 overflow-hidden rounded-2xl px-6 py-14 text-center">
            <div
              aria-hidden="true"
              className="bg-brand-accent/30 absolute -top-24 -right-24 size-64 rounded-full blur-3xl"
            />
            <h2 className="font-display relative max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {t.formatMessage({
                defaultMessage:
                  "Write your career once. Apply with confidence.",
              })}
            </h2>
            <p className="text-primary-foreground/70 relative max-w-xl text-pretty">
              {t.formatMessage({
                defaultMessage:
                  "Start from the resume you have; the agent takes it from there.",
              })}
            </p>
            <Button asChild size="lg" variant="secondary" className="relative">
              <Link href="/sign-up">
                {t.formatMessage({ defaultMessage: "Start free" })}
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </LandingContainer>
      </section>
      <div className="border-t">
        <LandingContainer className="flex flex-col gap-6 py-10">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div className="flex flex-col gap-2">
              <BrandLockup />
              <p className="text-muted-foreground max-w-sm text-sm">
                {t.formatMessage({
                  defaultMessage:
                    "Tailored resumes and cover letters from a career story you approved. Nothing is invented.",
                })}
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
          <Separator />
          <p className="text-muted-foreground text-xs">
            {t.formatMessage(
              { defaultMessage: "© {year} StoryToRole" },
              { year: String(new Date().getFullYear()) }
            )}
          </p>
        </LandingContainer>
      </div>
    </footer>
  );
}
