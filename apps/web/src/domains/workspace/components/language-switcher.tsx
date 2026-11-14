"use client";

import { useTransition } from "react";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";

import { intlConfig, type Locale } from "@repo/intl/intl-config";
import { useTranslation } from "@repo/intl/use-translation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/web/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@repo/web/components/ui/sidebar";

import { setLocaleAction } from "~/tools/intl/actions/set-locale-action";

/** The interface language, independent of every other language. */
export function LanguageSwitcher() {
  const t = useTranslation();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function changeLocale(locale: string) {
    startTransition(async () => {
      await setLocaleAction(locale as Locale);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton disabled={isPending}>
          <Languages />
          <span>{intlConfig.locales[t.locale].translatedName}</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel>
          {t.formatMessage({ defaultMessage: "Interface language" })}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={t.locale} onValueChange={changeLocale}>
          {intlConfig.localeCodes.map((locale) => (
            <DropdownMenuRadioItem key={locale} value={locale}>
              {intlConfig.locales[locale].translatedName}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
