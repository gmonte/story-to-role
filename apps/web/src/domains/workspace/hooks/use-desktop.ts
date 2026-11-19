"use client";

import { useEffect, useState } from "react";

// Tailwind's `lg`: where the workspace shows its side columns.
const desktopQuery = "(min-width: 1024px)";
// Tailwind's `xl`: where the opening page has room for three columns.
const wideQuery = "(min-width: 1280px)";

/**
 * Whether the screen matches a media query. The server (and the first
 * client render) assume it does, so the markup agrees; a screen that
 * doesn't learns otherwise right after hydration.
 */
function useMatches(mediaQuery: string) {
  const [matches, setMatches] = useState(true);
  useEffect(() => {
    const query = window.matchMedia(mediaQuery);
    const onChange = () => setMatches(query.matches);
    query.addEventListener("change", onChange);
    onChange();
    return () => query.removeEventListener("change", onChange);
  }, [mediaQuery]);
  return matches;
}

/** Whether the screen is wide enough for the workspace's side columns. */
export function useDesktop() {
  return useMatches(desktopQuery);
}

/** Whether the screen has room for the opening page's three columns. */
export function useWide() {
  return useMatches(wideQuery);
}
