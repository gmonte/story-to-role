"use client";

import { useEffect, useRef } from "react";

import { Loader2 } from "lucide-react";

import { cn } from "../../lib/utils";

/**
 * Sentinel rendered below an infinitely scrolled list. When it scrolls into
 * view it calls `onLoadMore` to fetch the next cursor page, and shows a
 * spinner while that page loads.
 */
export function InfiniteScroll({
  hasMore,
  loadingMore,
  onLoadMore,
  className,
}: {
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  className?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) {
          onLoadMore();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  if (!hasMore && !loadingMore) return null;

  return (
    <div
      ref={sentinelRef}
      className={cn("flex items-center justify-center py-4", className)}
    >
      {loadingMore && (
        <Loader2
          className="text-muted-foreground size-5 animate-spin"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
