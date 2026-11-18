import { useCallback, useEffect, useRef, useState } from "react";

export type WatchdogPhase = "idle" | "recovering" | "failed";

/**
 * Watches a sent message for its answer to start. When the status stays
 * `submitted` for `timeoutMs`, it asks `recover` once (the phase reads
 * `recovering`); if the retry gets no answer either, the phase is `failed`
 * instead of looping. An answer streaming, or `reset`, clears it.
 */
export function useAnswerWatchdog({
  status,
  timeoutMs,
  recover,
}: {
  status: string;
  timeoutMs: number;
  recover: () => Promise<void> | void;
}) {
  const [phase, setPhase] = useState<WatchdogPhase>("idle");
  const attempts = useRef(0);
  const recoverRef = useRef(recover);
  useEffect(() => {
    recoverRef.current = recover;
  });

  const reset = useCallback(() => {
    attempts.current = 0;
    setPhase("idle");
  }, []);

  useEffect(() => {
    if (status === "streaming") {
      attempts.current = 0;
      // An answer arriving is an external event: the status line clears.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("idle");
      return;
    }
    if (status !== "submitted") return;
    const timer = setTimeout(() => {
      if (attempts.current < 1) {
        attempts.current += 1;
        setPhase("recovering");
        void Promise.resolve(recoverRef.current()).catch(() =>
          setPhase("failed")
        );
      } else {
        setPhase("failed");
      }
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [status, timeoutMs]);

  const fail = useCallback(() => setPhase("failed"), []);

  return { phase, reset, fail };
}
