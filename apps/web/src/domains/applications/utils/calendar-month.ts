/** Months as YYYY-MM and days as YYYY-MM-DD, in the viewer's calendar. */

const pad = (value: number) => String(value).padStart(2, "0");

export const monthOf = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

export const dayOf = (date: Date) => `${monthOf(date)}-${pad(date.getDate())}`;

export function isMonth(value: string | null): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** The month `delta` months away. */
export function shiftMonth(month: string, delta: number) {
  const [year, index] = month.split("-").map(Number);
  return monthOf(new Date(year, index - 1 + delta, 1));
}

/** The month's first day, at local midday (safe to format in any zone). */
export function monthStart(month: string) {
  const [year, index] = month.split("-").map(Number);
  return new Date(year, index - 1, 1, 12);
}

/**
 * The month's weeks, Sunday first, each day with whether it belongs to the
 * month (the first and last weeks borrow days from the months around it).
 */
export function monthWeeks(month: string) {
  const start = monthStart(month);
  const first = new Date(start);
  first.setDate(1 - start.getDay());
  const weeks: Array<Array<{ day: string; inMonth: boolean; date: Date }>> = [];
  const cursor = new Date(first);
  do {
    const week = [];
    for (let index = 0; index < 7; index++) {
      week.push({
        day: dayOf(cursor),
        inMonth: monthOf(cursor) === month,
        date: new Date(cursor),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  } while (monthOf(cursor) === month);
  return weeks;
}
