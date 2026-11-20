import { Show } from "@clerk/nextjs";
import Link from "next/link";

import { getTranslation } from "@repo/intl/get-translation";
import type { Locale } from "@repo/intl/intl-config";
import { Button } from "@repo/web/components/ui/button";

import { BrandLockup } from "~/domains/brand/components/brand-lockup";
import { LanguageSwitcher } from "~/domains/workspace/components/language-switcher";
import { ThemeSwitcher } from "~/domains/workspace/components/theme-switcher";

import { LandingMobileMenu } from "./landing-mobile-menu";
import { LandingContainer } from "./section-heading";

/** The landing page's sticky bar: the lockup, the sections and sign-in. */
export async function LandingHeader({ locale }: { locale: Locale }) {
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
    <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <LandingContainer className="flex h-14 items-center gap-6">
        <Link href="/" className="shrink-0">
          <BrandLockup />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Button key={link.href} asChild variant="ghost" size="sm">
              <a href={link.href} className="text-muted-foreground">
                {link.label}
              </a>
            </Button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {/* On a phone they live in the menu, so the bar fits. */}
          <div className="hidden items-center gap-1 sm:flex">
            <LanguageSwitcher variant="icon" />
            <ThemeSwitcher variant="icon" />
          </div>
          <Show when="signed-out">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
            >
              <Link href="/sign-in">
                {t.formatMessage({ defaultMessage: "Sign in" })}
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">
                {t.formatMessage({ defaultMessage: "Start free" })}
              </Link>
            </Button>
          </Show>
          <Show when="signed-in">
            <Button asChild size="sm">
              <Link href="/app">
                {t.formatMessage({ defaultMessage: "Open the app" })}
              </Link>
            </Button>
          </Show>
          <LandingMobileMenu links={links} />
        </div>
      </LandingContainer>
    </header>
  );
}
