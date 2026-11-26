"use client";

import { useEffect, useState } from "react";

import { ListFilter, Plus, Search, X } from "lucide-react";

import type {
  BoardFilter,
  BoardSort,
} from "@repo/api/domains/applications/schemas/tracker";
import type { FitBand } from "@repo/api/domains/openings/schemas/opening";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
import { Input } from "@repo/web/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/web/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/web/components/ui/select";
import { cn } from "@repo/web/lib/utils";

import { FitBandDot } from "~/domains/openings/components/fit-band-badge";

import { useTrackerLabels } from "../hooks/use-tracker-labels";
import {
  boardChips,
  boardFieldValues,
  boardFilterFields,
  defaultBoardFilter,
  isDefaultBoardFilter,
  isDefaultChip,
  withChip,
  type BoardChip,
  type BoardFilterField,
} from "../utils/board-filter";

/**
 * The Openings page's filter (tracker spec, “The filter”), as GitLab's
 * issue filter: chips of a field, is or is not, and values; free text over
 * company and title; a notice and the way back when it isn't the default.
 */
export function BoardFilterBar({
  filter,
  onChange,
  total,
  sort,
  onSortChange,
}: {
  filter: BoardFilter;
  onChange: (filter: BoardFilter) => void;
  // The openings the filter matches, once known.
  total?: number;
  sort?: BoardSort;
  onSortChange?: (sort: BoardSort) => void;
}) {
  const t = useTranslation();
  const chips = boardChips(filter);
  const isDefault = isDefaultBoardFilter(filter);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <FilterChip
            key={`${chip.field}-${chip.negated}`}
            chip={chip}
            onApply={(next) =>
              onChange(withChip(withChip(filter, chip, []), next))
            }
            onRemove={() => onChange(withChip(filter, chip, []))}
          />
        ))}
        <AddFilter onApply={(chip) => onChange(withChip(filter, chip))} />
        <SearchInput
          value={filter.q ?? ""}
          onChange={(q) => {
            const next = { ...filter };
            if (q) next.q = q;
            else delete next.q;
            onChange(next);
          }}
        />
        {sort && onSortChange && (
          <SortSelect sort={sort} onChange={onSortChange} />
        )}
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs">
        {total !== undefined && (
          <span aria-live="polite">
            {t.formatMessage(
              {
                defaultMessage:
                  "{count, plural, =0 {No openings} one {# opening} other {# openings}}",
              },
              { count: total }
            )}
          </span>
        )}
        {!isDefault && (
          <>
            <span className="text-brand-accent-text font-medium">
              {t.formatMessage({ defaultMessage: "Not the default filter" })}
            </span>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => onChange(defaultBoardFilter)}
            >
              {t.formatMessage({ defaultMessage: "Restore default" })}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  chip,
  onApply,
  onRemove,
}: {
  chip: BoardChip;
  onApply: (chip: BoardChip) => void;
  onRemove: () => void;
}) {
  const t = useTranslation();
  const labels = useTrackerLabels();
  const [open, setOpen] = useState(false);
  const values = t.formatList(
    chip.values.map((value) => labels.filterValue(chip.field, value)),
    { type: "disjunction" }
  );
  const text = chip.negated
    ? t.formatMessage(
        { defaultMessage: "{field} is not {values}" },
        { field: labels.field(chip.field), values }
      )
    : t.formatMessage(
        { defaultMessage: "{field} is {values}" },
        { field: labels.field(chip.field), values }
      );
  // A chip that isn't the default stands out (ADR 0012: the accent marks
  // what is active).
  const standsOut = !isDefaultChip(chip);
  return (
    <span
      className={cn(
        "flex h-8 items-center rounded-md border text-xs",
        standsOut && "border-brand-accent bg-brand-accent-soft"
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="max-w-72 truncate px-2.5 py-1 text-left font-medium"
          >
            {text}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <FilterEditor
            initial={chip}
            onApply={(next) => {
              setOpen(false);
              onApply(next);
            }}
          />
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 rounded-l-none"
        aria-label={t.formatMessage(
          { defaultMessage: "Remove the filter {filter}" },
          { filter: text }
        )}
        onClick={onRemove}
      >
        <X className="size-3.5" />
      </Button>
    </span>
  );
}

function AddFilter({ onApply }: { onApply: (chip: BoardChip) => void }) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <ListFilter />
          {t.formatMessage({ defaultMessage: "Filter" })}
          <Plus className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        {/* Remounted at each opening: it starts from the field list. */}
        {open && (
          <FilterEditor
            onApply={(chip) => {
              setOpen(false);
              onApply(chip);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The steps of a chip: pick the field (when adding), then is or is not,
 * then the values; company takes text, the rest a list.
 */
function FilterEditor({
  initial,
  onApply,
}: {
  initial?: BoardChip;
  onApply: (chip: BoardChip) => void;
}) {
  const t = useTranslation();
  const labels = useTrackerLabels();
  const [field, setField] = useState<BoardFilterField | null>(
    initial?.field ?? null
  );
  const [negated, setNegated] = useState(initial?.negated ?? false);
  const [values, setValues] = useState<string[]>(initial?.values ?? []);
  const [text, setText] = useState(
    initial?.field === "company" ? (initial.values[0] ?? "") : ""
  );

  if (!field) {
    return (
      <div className="flex flex-col p-1">
        <p className="text-muted-foreground px-2 py-1.5 text-xs">
          {t.formatMessage({ defaultMessage: "Filter by" })}
        </p>
        {boardFilterFields.map((option) => (
          <Button
            key={option}
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => setField(option)}
          >
            {labels.field(option)}
          </Button>
        ))}
      </div>
    );
  }

  const chosen =
    field === "company" ? (text.trim() ? [text.trim()] : []) : values;
  return (
    <form
      className="flex flex-col gap-3 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (chosen.length > 0) onApply({ field, negated, values: chosen });
      }}
    >
      <p className="text-sm font-medium">{labels.field(field)}</p>
      <div
        className="flex gap-1"
        role="radiogroup"
        aria-label={t.formatMessage({ defaultMessage: "Operator" })}
      >
        {[false, true].map((option) => (
          <Button
            key={String(option)}
            type="button"
            size="sm"
            role="radio"
            aria-checked={negated === option}
            variant={negated === option ? "secondary" : "ghost"}
            onClick={() => setNegated(option)}
          >
            {option
              ? t.formatMessage({ defaultMessage: "is not" })
              : t.formatMessage({ defaultMessage: "is" })}
          </Button>
        ))}
      </div>
      {field === "company" ? (
        <Input
          autoFocus
          value={text}
          maxLength={200}
          placeholder={t.formatMessage({
            defaultMessage: "Part of the company's name",
          })}
          aria-label={labels.field(field)}
          onChange={(event) => setText(event.target.value)}
        />
      ) : (
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {boardFieldValues[field].map((value) => (
            <label
              key={value}
              className="hover:bg-muted flex items-center gap-2 rounded-sm px-1 py-1"
            >
              <Checkbox
                checked={values.includes(value)}
                onCheckedChange={(checked) =>
                  setValues((current) =>
                    checked === true
                      ? [...current, value]
                      : current.filter((item) => item !== value)
                  )
                }
              />
              {field === "fit" && value !== "not_checked" && (
                <FitBandDot band={value as FitBand} />
              )}
              {labels.filterValue(field, value)}
            </label>
          ))}
        </div>
      )}
      <Button type="submit" size="sm" disabled={chosen.length === 0}>
        {t.formatMessage({ defaultMessage: "Apply" })}
      </Button>
    </form>
  );
}

/** Free text over company and title, sent once the user stops typing. */
function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslation();
  const [text, setText] = useState(value);
  // The URL wins when it changes elsewhere (Restore default, a link).
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(value);
  }
  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => onChange(text.trim()), 400);
    return () => clearTimeout(timer);
  }, [text, value, onChange]);
  return (
    <div className="relative min-w-48 flex-1">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
      <Input
        value={text}
        maxLength={200}
        onChange={(event) => setText(event.target.value)}
        placeholder={t.formatMessage({
          defaultMessage: "Search company or title",
        })}
        aria-label={t.formatMessage({
          defaultMessage: "Search company or title",
        })}
        className="h-8 pl-8"
      />
    </div>
  );
}

function SortSelect({
  sort,
  onChange,
}: {
  sort: BoardSort;
  onChange: (sort: BoardSort) => void;
}) {
  const t = useTranslation();
  return (
    <Select value={sort} onValueChange={(next) => onChange(next as BoardSort)}>
      <SelectTrigger
        size="sm"
        aria-label={t.formatMessage({ defaultMessage: "Sort by" })}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="activity">
          {t.formatMessage({ defaultMessage: "Last activity" })}
        </SelectItem>
        <SelectItem value="sent">
          {t.formatMessage({ defaultMessage: "Sent date" })}
        </SelectItem>
        <SelectItem value="company">
          {t.formatMessage({ defaultMessage: "Company" })}
        </SelectItem>
        <SelectItem value="status">
          {t.formatMessage({ defaultMessage: "Status" })}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
