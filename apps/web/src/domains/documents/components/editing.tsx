"use client";

import { useState } from "react";

import type { LineOrigin } from "@repo/api/domains/documents/schemas/document";
import { useTranslation } from "@repo/intl/use-translation";
import { Textarea } from "@repo/web/components/ui/textarea";
import { cn } from "@repo/web/lib/utils";

/** The trace's color for each line origin, shared by both editors. */
export const originTone: Record<LineOrigin["kind"], string> = {
  evidence: "border-l-origin-profile bg-origin-profile/5",
  skill: "border-l-origin-profile bg-origin-profile/5",
  credential: "border-l-origin-profile bg-origin-profile/5",
  instruction: "border-l-origin-instruction bg-origin-instruction/5",
  manual: "border-l-origin-written bg-origin-written/5",
  letter: "border-l-origin-profile bg-origin-profile/5",
  edited: "border-l-origin-edited border-dashed bg-origin-edited/5",
};

/**
 * The origin marker the document editor always shows (resume spec, "Trace
 * in the editor"): a thin rule beside the line, quiet enough to read past;
 * a dashed one marks a traced line the user reworded.
 */
export const originMarker: Record<LineOrigin["kind"], string> = {
  evidence: "border-l-origin-profile/60",
  skill: "border-l-origin-profile/60",
  credential: "border-l-origin-profile/60",
  instruction: "border-l-origin-instruction/60",
  manual: "border-l-origin-written/60",
  letter: "border-l-origin-profile/60",
  edited: "border-l-origin-edited/60 border-dashed",
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
