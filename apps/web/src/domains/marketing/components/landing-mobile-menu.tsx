"use client";

import { Menu } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/web/components/ui/sheet";

import { BrandLockup } from "~/domains/brand/components/brand-lockup";
import { LanguageSwitcher } from "~/domains/workspace/components/language-switcher";
import { ThemeSwitcher } from "~/domains/workspace/components/theme-switcher";

/** The landing page's sections, language and theme in a sheet, on a phone. */
export function LandingMobileMenu({
  links,
}: {
  links: Array<{ href: string; label: string }>;
}) {
  const t = useTranslation();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label={t.formatMessage({ defaultMessage: "Open the menu" })}
        >
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle>
            <BrandLockup />
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4">
          {links.map((link) => (
            <SheetClose key={link.href} asChild>
              <Button asChild variant="ghost" className="justify-start">
                <a href={link.href}>{link.label}</a>
              </Button>
            </SheetClose>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-1 border-t p-4">
          <LanguageSwitcher variant="icon" />
          <ThemeSwitcher variant="icon" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
