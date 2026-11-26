"use client";

import { useEffect, useEffectEvent, useState } from "react";

type PdfFile = { src: string; url: string | null; failed: boolean };

/**
 * A rendered PDF fetched as a file for the preview's iframe, which can't
 * tell a missing file from an empty page. A 409 means the version's file is
 * gone from storage (a cache): the server is already rendering it anew, so
 * `onMissing` refreshes the version to show it rendering.
 */
export function usePdfFile(src: string | null, onMissing: () => Promise<void>) {
  const [file, setFile] = useState<PdfFile | null>(null);
  const missing = useEffectEvent(onMissing);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    let url: string | null = null;
    void (async () => {
      try {
        const response = await fetch(src);
        if (cancelled) return;
        if (response.status === 409) {
          await missing();
          return;
        }
        if (!response.ok) throw new Error(`PDF responded ${response.status}`);
        const blob = await response.blob();
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setFile({ src, url, failed: false });
      } catch {
        if (!cancelled) setFile({ src, url: null, failed: true });
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src]);

  // A file fetched for another snapshot is never shown.
  return file?.src === src ? file : null;
}
