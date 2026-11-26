export type OverviewTab = "tracking" | "calendar" | "settings";

export const overviewTabPaths: Record<OverviewTab, string> = {
  tracking: "/app/openings",
  calendar: "/app/openings/calendar",
  settings: "/app/openings/settings",
};

/** What only one tab reads: the others leave it behind. */
const ownParams: Record<OverviewTab, string[]> = {
  tracking: ["view"],
  calendar: ["month", "show"],
  settings: [],
};

/**
 * A tab's address from the current query: Tracking and Calendar share the
 * filter, so it goes along between them; Settings takes none.
 */
export function overviewTabHref(
  tab: OverviewTab,
  params: Pick<URLSearchParams, "entries">,
  from: OverviewTab
) {
  const path = overviewTabPaths[tab];
  if (tab === "settings") return path;
  const query = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (from === tab || !ownParams[from].includes(key)) query.set(key, value);
  }
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}
