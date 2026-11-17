"use client";

import { useId, useState } from "react";

import {
  generationSettingsFields,
  type GenerationSettings,
} from "@repo/api/domains/documents/schemas/generation-settings";
import { useTranslation } from "@repo/intl/use-translation";
import { Input } from "@repo/web/components/ui/input";
import { Label } from "@repo/web/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/web/components/ui/select";

type NumberKey = Exclude<keyof GenerationSettings, "veryOld">;

const limits = generationSettingsFields.shape;

/**
 * The generation settings as a form (resume spec, "Generation settings"):
 * the user's defaults in the writing settings, and what they change for
 * one document when generating it. The cover letter's fields show only
 * where a letter is concerned.
 */
export function GenerationSettingsFields({
  value,
  onChange,
  letter = false,
}: {
  value: GenerationSettings;
  onChange: (value: GenerationSettings) => void;
  letter?: boolean;
}) {
  const t = useTranslation();
  const veryOldId = useId();
  const number = (key: NumberKey, label: string, hint?: string) => (
    <NumberField
      label={label}
      hint={hint}
      value={value[key]}
      min={limits[key].minValue ?? 0}
      max={limits[key].maxValue ?? 99}
      onChange={(next) => onChange({ ...value, [key]: next })}
    />
  );

  return (
    <div className="grid gap-2.5">
      {number(
        "bulletsRecent",
        t.formatMessage({ defaultMessage: "Bullets per recent experience" })
      )}
      {number(
        "recentYears",
        t.formatMessage({ defaultMessage: "What counts as recent (years)" }),
        t.formatMessage({
          defaultMessage:
            "An experience you are in now, or one that ended at most this many years ago.",
        })
      )}
      {number(
        "bulletsOlder",
        t.formatMessage({ defaultMessage: "Bullets per older experience" })
      )}
      <div className="grid gap-1.5 text-sm">
        <Label htmlFor={veryOldId} className="font-normal">
          {t.formatMessage({ defaultMessage: "Very old experiences" })}
        </Label>
        <Select
          value={value.veryOld}
          onValueChange={(next) =>
            onChange({
              ...value,
              veryOld: next as GenerationSettings["veryOld"],
            })
          }
        >
          <SelectTrigger id={veryOldId} size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relevant_only">
              {t.formatMessage({
                defaultMessage: "Left out, unless relevant to the document",
              })}
            </SelectItem>
            <SelectItem value="leave_out">
              {t.formatMessage({ defaultMessage: "Always left out" })}
            </SelectItem>
            <SelectItem value="keep">
              {t.formatMessage({ defaultMessage: "Kept like older ones" })}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {number(
        "veryOldYears",
        t.formatMessage({
          defaultMessage: "What counts as very old (years)",
        }),
        t.formatMessage({
          defaultMessage:
            "An experience that ended this many years ago or more.",
        })
      )}
      {number(
        "resumeMaxPages",
        t.formatMessage({ defaultMessage: "Resume pages, at most" })
      )}
      {letter && (
        <>
          {number(
            "letterMaxParagraphs",
            t.formatMessage({
              defaultMessage: "Cover letter paragraphs, at most",
            })
          )}
          {number(
            "letterMaxPages",
            t.formatMessage({ defaultMessage: "Cover letter pages, at most" })
          )}
        </>
      )}
    </div>
  );
}

/**
 * A whole number within its limits. What is being typed stays as typed;
 * only a value inside the limits is passed on, and leaving the field
 * brings back the last one that was.
 */
function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  // The value changed outside the field (a save, another document).
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(String(value));
  }

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="flex flex-col">
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </div>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        className="h-8 w-16 shrink-0 text-center"
        min={min}
        max={max}
        step={1}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          const next = Number(event.target.value);
          if (
            event.target.value.trim() &&
            Number.isInteger(next) &&
            next >= min &&
            next <= max
          ) {
            onChange(next);
          }
        }}
        onBlur={() => setText(String(value))}
      />
    </div>
  );
}
