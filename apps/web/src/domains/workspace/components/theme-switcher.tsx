"use client";

import { useSyncExternalStore } from "react";

import { FileText, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { useTranslation } from "@repo/intl/use-translation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuHeader,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/web/components/ui/dropdown-menu";
import { Button } from "@repo/web/components/ui/button";
import { SidebarMenuButton } from "@repo/web/components/ui/sidebar";

import { setSheetThemeAction } from "../actions/set-sheet-theme-action";
import { type SheetTheme, sheetThemeSchema } from "../utils/sheet-theme";

// Nothing to subscribe to: the snapshots only tell the server and browser apart.
const subscribe = () => () => undefined;

// The sheet's look lives on <html data-sheet>, where globals.css reads it.
function subscribeToSheet(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-sheet"],
  });
  return () => observer.disconnect();
}
const readSheet = (): SheetTheme =>
  sheetThemeSchema.catch("auto").parse(document.documentElement.dataset.sheet);

/**
 * Light, dark or following the system, remembered by next-themes in this
 * browser, and the document sheet's own look (light, dark, or following the
 * theme), kept in a cookie so the server renders it. `icon` is a bare icon
 * button, for a page without the sidebar.
 */
export function ThemeSwitcher({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "icon";
}) {
  const t = useTranslation();
  const { theme, setTheme } = useTheme();
  // The stored theme is only known in the browser, so the server renders "system".
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  const themes = [
    {
      value: "light",
      label: t.formatMessage({ defaultMessage: "Light" }),
      icon: Sun,
    },
    {
      value: "dark",
      label: t.formatMessage({ defaultMessage: "Dark" }),
      icon: Moon,
    },
    {
      value: "system",
      label: t.formatMessage({ defaultMessage: "System" }),
      icon: Monitor,
    },
  ];
  const current =
    themes.find((option) => isClient && option.value === theme) ?? themes[2];
  const sheet = useSyncExternalStore(subscribeToSheet, readSheet, () => "auto");
  const sheets: Array<{ value: SheetTheme; label: string }> = [
    {
      value: "light",
      label: t.formatMessage({ defaultMessage: "White paper" }),
    },
    {
      value: "dark",
      label: t.formatMessage({ defaultMessage: "Dark paper" }),
    },
    {
      value: "auto",
      label: t.formatMessage({
        defaultMessage: "Automatic (follows the theme)",
      }),
    },
  ];
  const setSheet = (value: string) => {
    const next = sheetThemeSchema.parse(value);
    document.documentElement.dataset.sheet = next;
    void setSheetThemeAction(next);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.formatMessage({ defaultMessage: "Theme" })}
          >
            <current.icon />
          </Button>
        ) : (
          <SidebarMenuButton
            tooltip={t.formatMessage({ defaultMessage: "Theme" })}
          >
            <current.icon />
            <span>{current.label}</span>
          </SidebarMenuButton>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={variant === "icon" ? "bottom" : "top"}
        align={variant === "icon" ? "end" : "start"}
        className="w-56"
      >
        <DropdownMenuHeader>
          {t.formatMessage({ defaultMessage: "Theme" })}
        </DropdownMenuHeader>
        <DropdownMenuRadioGroup value={current.value} onValueChange={setTheme}>
          {themes.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <option.icon />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuHeader>
          {t.formatMessage({ defaultMessage: "Document sheet" })}
        </DropdownMenuHeader>
        <DropdownMenuRadioGroup value={sheet} onValueChange={setSheet}>
          {sheets.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <FileText />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
