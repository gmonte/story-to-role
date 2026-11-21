"use client";

import { useSyncExternalStore } from "react";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

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

// Nothing to subscribe to: the snapshots only tell the server and browser apart.
const subscribe = () => () => undefined;

/**
 * Light, dark or following the system, remembered by next-themes in this
 * browser. `icon` is a bare icon button, for a page without the sidebar.
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
