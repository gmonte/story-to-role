"use client";

import { useState, type ComponentProps, type ReactNode } from "react";

import { Check, Settings } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/web/components/ui/popover";
import { cn } from "@repo/web/lib/utils";

/** A sidebar section: a small muted heading, an action on the right, the value below. */
export function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5 border-b py-3 first:pt-0 last:border-b-0">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="text-muted-foreground font-sans text-[11.5px] font-semibold tracking-[0.07em] uppercase">
          {label}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The gear button that opens a section's editor. */
export function GearButton({
  label,
  ...props
}: { label: string } & ComponentProps<typeof Button>) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className="text-muted-foreground size-6"
      aria-label={label}
      {...props}
    >
      <Settings className="size-3.5" />
    </Button>
  );
}

export type Option<Value extends string> = { value: Value; label: string };

/** A gear that opens a list of options, the way GitHub's sidebar does. */
export function OptionsPopover<Value extends string>({
  label,
  value,
  options,
  disabled,
  onSelect,
}: {
  label: string;
  value: Value | null;
  options: Array<Option<Value>>;
  disabled?: boolean;
  onSelect: (value: Value) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <GearButton label={label} disabled={disabled} />
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-56 flex-col gap-0.5 p-1">
        {options.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant="ghost"
            className="min-w-0 justify-start"
            onClick={() => {
              setOpen(false);
              if (option.value !== value) onSelect(option.value);
            }}
          >
            <Check
              className={cn("size-3.5", option.value !== value && "invisible")}
            />
            <span className="truncate">{option.label}</span>
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** The empty value, muted. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

/** Saves and cancels an inline editor. */
export function EditActions({
  pending,
  onCancel,
}: {
  pending: boolean;
  onCancel: () => void;
}) {
  const t = useTranslation();
  return (
    <div className="flex gap-2">
      <Button type="submit" size="sm" disabled={pending}>
        {t.formatMessage({ defaultMessage: "Save" })}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        {t.formatMessage({ defaultMessage: "Cancel" })}
      </Button>
    </div>
  );
}
