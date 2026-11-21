"use client";

import { useTransition } from "react";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";

import { intlConfig, type Locale } from "@repo/intl/intl-config";
import { useTranslation } from "@repo/intl/use-translation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuHeader,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@repo/web/components/ui/dropdown-menu";
import { Button } from "@repo/web/components/ui/button";
import { SidebarMenuButton } from "@repo/web/components/ui/sidebar";

import { setLocaleAction } from "~/tools/intl/actions/set-locale-action";

/**
 * The interface language, independent of every other language. `icon` is a
 * bare icon button, for a page without the sidebar.
 */
export function LanguageSwitcher({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "icon";
}) {
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
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending}
            aria-label={t.formatMessage({
              defaultMessage: "Interface language",
            })}
          >
            <Languages />
          </Button>
        ) : (
          <SidebarMenuButton
            disabled={isPending}
            tooltip={t.formatMessage({ defaultMessage: "Interface language" })}
          >
            <Languages />
            <span>{intlConfig.locales[t.locale].translatedName}</span>
          </SidebarMenuButton>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={variant === "icon" ? "bottom" : "top"}
        align={variant === "icon" ? "end" : "start"}
        className="w-56"
      >
        <DropdownMenuHeader>
          {t.formatMessage({ defaultMessage: "Interface language" })}
        </DropdownMenuHeader>
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
