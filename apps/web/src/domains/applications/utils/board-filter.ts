import { applicationSourceSchema } from "@repo/api/domains/applications/schemas/application";
import {
  boardSortSchema,
  boardStateSchema,
  boardStatusSchema,
  fitFilterSchema,
  resumeOriginSchema,
  sentFilterSchema,
  type BoardFilter,
  type BoardSort,
} from "@repo/api/domains/applications/schemas/tracker";

/** The fields a chip can filter by, in the order the menu lists them. */
export const boardFilterFields = [
  "status",
  "state",
  "company",
  "source",
  "fit",
  "sent",
  "resume",
] as const;
export type BoardFilterField = (typeof boardFilterFields)[number];

/** Each field with a fixed list of values, and that list. */
export const boardFieldValues = {
  status: boardStatusSchema.options,
  state: boardStateSchema.options,
  source: applicationSourceSchema.options,
  fit: fitFilterSchema.options,
  sent: sentFilterSchema.options,
  resume: resumeOriginSchema.options,
} as const;

/** The filter the page opens with (tracker spec): State is open. */
export const defaultBoardFilter: BoardFilter = { state: ["open"] };

/** Removing every chip, the default included, is a state of its own. */
const noFilter = "none";

const notKey = (field: BoardFilterField) => `${field}_not`;

/** Every query key the filter owns, to clear before writing it again. */
export const boardFilterKeys = [
  ...boardFilterFields.flatMap((field) => [field, notKey(field)]),
  "q",
  "filter",
  "sort",
];

function listOf<T extends string>(
  params: Pick<URLSearchParams, "getAll">,
  key: string,
  allowed?: readonly T[]
): T[] | undefined {
  const values = [
    ...new Set(
      params
        .getAll(key)
        .flatMap((value) => (allowed ? value.split(",") : [value]))
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ];
  const kept = allowed
    ? values.filter((value): value is T => allowed.includes(value as T))
    : (values as T[]);
  return kept.length > 0
    ? kept.map((value) => value.slice(0, 200) as T)
    : undefined;
}

/**
 * The filter and sort the URL carries. With no filter in the URL, the
 * default; `filter=none` is every chip removed.
 */
export function parseBoardQuery(
  params: Pick<URLSearchParams, "get" | "getAll">
): { filter: BoardFilter; sort: BoardSort } {
  const sort = boardSortSchema.safeParse(params.get("sort"));
  const filter: BoardFilter = {};
  for (const field of boardFilterFields) {
    const allowed = field === "company" ? undefined : boardFieldValues[field];
    const is = listOf(params, field, allowed);
    const not = listOf(params, notKey(field), allowed);
    if (is) Object.assign(filter, { [field]: is });
    if (not) Object.assign(filter, { [`${field}Not`]: not });
  }
  const q = params.get("q")?.trim().slice(0, 200);
  if (q) filter.q = q;
  const empty = Object.keys(filter).length === 0;
  return {
    filter:
      empty && params.get("filter") !== noFilter ? defaultBoardFilter : filter,
    sort: sort.success ? sort.data : "activity",
  };
}

/** The URL's query for a filter and sort: only what differs from the default. */
export function boardQueryToParams(filter: BoardFilter, sort: BoardSort) {
  const params = new URLSearchParams();
  if (!isDefaultBoardFilter(filter)) {
    for (const field of boardFilterFields) {
      const is = filter[field];
      const not = filter[`${field}Not`];
      // Company is free text, which may hold commas: one parameter each.
      const write = (key: string, values: readonly string[] | undefined) => {
        if (!values?.length) return;
        if (field === "company") values.forEach((v) => params.append(key, v));
        else params.set(key, values.join(","));
      };
      write(field, is);
      write(notKey(field), not);
    }
    if (filter.q) params.set("q", filter.q);
    if (params.size === 0) params.set("filter", noFilter);
  }
  if (sort !== "activity") params.set("sort", sort);
  return params;
}

const sameValues = (a?: readonly string[], b?: readonly string[]) =>
  (a ?? []).length === (b ?? []).length &&
  (a ?? []).every((value) => (b ?? []).includes(value));

export function isDefaultBoardFilter(filter: BoardFilter) {
  const keys = Object.entries(filter)
    .filter(([, value]) => (Array.isArray(value) ? value.length > 0 : !!value))
    .map(([key]) => key);
  return (
    keys.length === 1 &&
    keys[0] === "state" &&
    sameValues(filter.state, defaultBoardFilter.state)
  );
}

/** One chip: a field, is or is not, and its values. */
export type BoardChip = {
  field: BoardFilterField;
  negated: boolean;
  values: string[];
};

/** The filter as chips, in the menu's order. */
export function boardChips(filter: BoardFilter): BoardChip[] {
  return boardFilterFields.flatMap((field) => {
    const chips: BoardChip[] = [];
    const is = filter[field];
    const not = filter[`${field}Not`];
    if (is?.length) chips.push({ field, negated: false, values: [...is] });
    if (not?.length) chips.push({ field, negated: true, values: [...not] });
    return chips;
  });
}

/** The filter with one chip set (replacing that field and polarity) or removed. */
export function withChip(
  filter: BoardFilter,
  chip: BoardChip,
  values: string[] = chip.values
): BoardFilter {
  const key = chip.negated ? `${chip.field}Not` : chip.field;
  const next: Record<string, unknown> = { ...filter };
  if (values.length > 0) next[key] = values;
  else delete next[key];
  return next;
}

/** Whether a chip is part of the default filter, so it doesn't stand out. */
export function isDefaultChip(chip: BoardChip) {
  return (
    chip.field === "state" &&
    !chip.negated &&
    sameValues(chip.values, defaultBoardFilter.state)
  );
}
