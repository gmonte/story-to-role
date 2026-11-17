"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";

import { useTRPC } from "~/tools/trpc/client";

// How long the user pauses before the draft is saved.
const saveDelayMs = 800;
// How long a failed save waits before trying again.
const retryDelayMs = 5000;

export type SaveStatus = "saved" | "pending" | "saving" | "error" | "conflict";

export function useProfileDraftQuery() {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.profile.draft.queryOptions({}),
    // The editor owns the text once loaded; a refetch would reset it.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

/**
 * Saves the draft as the user types: one save at a time, each from the
 * revision the last one returned, the latest text winning. A save refused
 * because another tab saved first ends in "conflict" until a reload.
 */
export function useDraftAutosave(initial: {
  markdown: string;
  revision: number;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { mutateAsync: saveDraft } = useMutation(
    trpc.profile.saveDraft.mutationOptions()
  );
  const [status, setStatus] = useState<SaveStatus>("saved");
  const revision = useRef(initial.revision);
  const saved = useRef(initial.markdown);
  const latest = useRef(initial.markdown);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inFlight = useRef(false);
  // Bumped by a restore: a save that was in flight then is stale.
  const generation = useRef(0);

  // Saves until what's saved is the latest text: the user may keep typing
  // while a save is in flight.
  const flush = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // A profile never saved (the template) is saved once to exist.
      while (latest.current !== saved.current || revision.current === 0) {
        const markdown = latest.current;
        const started = generation.current;
        setStatus("saving");
        const result = await saveDraft({
          markdown,
          baseRevision: revision.current,
        });
        if (started !== generation.current) return;
        revision.current = result.revision;
        saved.current = markdown;
      }
      setStatus("saved");
      void queryClient.invalidateQueries({
        queryKey: trpc.career.startState.queryKey(),
      });
    } catch (error) {
      const conflict =
        error instanceof TRPCClientError &&
        (error.data as { code?: string } | undefined)?.code === "CONFLICT";
      setStatus(conflict ? "conflict" : "error");
    } finally {
      inFlight.current = false;
    }
  }, [queryClient, saveDraft, trpc]);

  const change = useCallback(
    (markdown: string) => {
      latest.current = markdown;
      if (markdown === saved.current) return;
      setStatus((current) => (current === "conflict" ? current : "pending"));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), saveDelayMs);
    },
    [flush]
  );

  // A dropped connection shouldn't wait for the next keystroke.
  useEffect(() => {
    if (status !== "error") return;
    const retry = setTimeout(() => void flush(), retryDelayMs);
    return () => clearTimeout(retry);
  }, [status, flush]);

  /** Saves now (before publishing), resolving to the saved revision. */
  const saveNow = useCallback(async () => {
    clearTimeout(timer.current);
    // Wait for a save in flight, then save what's left.
    while (inFlight.current) await new Promise((r) => setTimeout(r, 50));
    await flush();
    while (inFlight.current) await new Promise((r) => setTimeout(r, 50));
    return latest.current === saved.current ? revision.current : null;
  }, [flush]);

  /** After a restore saved on the server, the editor starts from it. */
  const reset = useCallback((next: { markdown: string; revision: number }) => {
    clearTimeout(timer.current);
    generation.current++;
    revision.current = next.revision;
    saved.current = next.markdown;
    latest.current = next.markdown;
    setStatus("saved");
  }, []);

  // Don't lose the last keystrokes when the user leaves the page.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (latest.current !== saved.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      clearTimeout(timer.current);
      if (latest.current !== saved.current && !inFlight.current) void flush();
    };
  }, [flush]);

  return { status, change, saveNow, reset, revision };
}
