/** Today as an `<input type="date">` value, in the user's time zone. */
export const today = () => new Date().toLocaleDateString("en-CA");

/**
 * A chosen day as an instant: now when it is today, midday otherwise (so
 * the day stays the same whatever the time zone).
 */
export const dayToDate = (day: string) =>
  day === today() ? new Date() : new Date(`${day}T12:00:00`);
