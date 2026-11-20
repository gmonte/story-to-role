"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

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

// Below Tailwind's `md`: a phone.
const phoneQuery = "(max-width: 767px)";

/**
 * Whether the screen is a phone (below `md`). The server and the first
 * client render say no, so the markup agrees.
 */
export function usePhone() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(phoneQuery);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(phoneQuery).matches,
    () => false
  );
}
