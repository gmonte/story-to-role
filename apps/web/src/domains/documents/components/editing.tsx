"use client";

import { useState } from "react";

import type { LineOrigin } from "@repo/api/domains/documents/schemas/document";
import { useTranslation } from "@repo/intl/use-translation";
import { Textarea } from "@repo/web/components/ui/textarea";
import { cn } from "@repo/web/lib/utils";

/** Trace mode's color for each line origin, shared by both editors. */
export const originTone: Record<LineOrigin["kind"], string> = {
  evidence: "border-l-emerald-500 bg-emerald-500/5",
  skill: "border-l-emerald-500 bg-emerald-500/5",
  credential: "border-l-emerald-500 bg-emerald-500/5",
  instruction: "border-l-sky-500 bg-sky-500/5",
  manual: "border-l-amber-500 bg-amber-500/5",
  letter: "border-l-emerald-500 bg-emerald-500/5",
};

/** Text that turns into a textarea when clicked. */
export function EditableText({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const t = useTranslation();
  const [editing, setEditing] = useState(value === "");
  if (editing) {
    return (
      <Textarea
        autoFocus
        defaultValue={value}
        className="min-h-0 text-sm"
        rows={Math.max(1, Math.ceil(value.length / 90))}
        onBlur={(event) => {
          setEditing(false);
          if (event.target.value !== value) onChange(event.target.value);
        }}
      />
    );
  }
  return (
    <p
      className={cn("cursor-text whitespace-pre-wrap", className)}
      onClick={() => setEditing(true)}
    >
      {value || (
        <span className="text-muted-foreground">
          {t.formatMessage({ defaultMessage: "Empty line" })}
        </span>
      )}
    </p>
  );
}
