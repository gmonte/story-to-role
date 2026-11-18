"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * The version open in the editor, kept in the URL (`?version=`) so the
 * side panel and the editor agree; the first version by default.
 */
export function useSelectedVersion<T extends { id: string }>(
  versions: T[],
  // The screen's tab the versions belong to (an opening's resume or letter).
  view: "resume" | "letter" = "resume"
) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const versionId = searchParams.get("version");
  const selected =
    versions.find((version) => version.id === versionId) ?? versions[0];

  return {
    selected,
    select: (id: string) => {
      const params = new URLSearchParams(searchParams);
      params.set("version", id);
      params.set("view", view);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
  };
}
