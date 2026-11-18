"use client";

import { useEffect, useState } from "react";

// Tailwind's `lg`: where the workspace shows its side columns.
const desktopQuery = "(min-width: 1024px)";

/**
 * Whether the screen is wide enough for the workspace's side columns.
 * The server (and the first client render) assume it is, so the markup
 * agrees; a narrow screen learns otherwise right after hydration.
 */
export function useDesktop() {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const query = window.matchMedia(desktopQuery);
    const onChange = () => setDesktop(query.matches);
    query.addEventListener("change", onChange);
    onChange();
    return () => query.removeEventListener("change", onChange);
  }, []);
  return desktop;
}
