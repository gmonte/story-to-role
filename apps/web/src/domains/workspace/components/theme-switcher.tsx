"use client";

import { useSyncExternalStore } from "react";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

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

// Nothing to subscribe to: the snapshots only tell the server and browser apart.
const subscribe = () => () => undefined;

/** Light, dark or following the system, remembered by next-themes in this browser. */
export function ThemeSwitcher() {
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
        <SidebarMenuButton
          tooltip={t.formatMessage({ defaultMessage: "Theme" })}
        >
          <current.icon />
          <span>{current.label}</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel>
          {t.formatMessage({ defaultMessage: "Theme" })}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
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
