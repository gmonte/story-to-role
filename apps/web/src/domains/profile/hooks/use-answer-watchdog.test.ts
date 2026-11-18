import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAnswerWatchdog } from "./use-answer-watchdog";

describe("useAnswerWatchdog", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (recover = vi.fn()) =>
    renderHook(
      ({ status }) => useAnswerWatchdog({ status, timeoutMs: 30_000, recover }),
      { initialProps: { status: "submitted" } }
    );

  it("does nothing before the timeout", () => {
    const recover = vi.fn();
    const { result } = setup(recover);
    act(() => void vi.advanceTimersByTime(29_000));
    expect(recover).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("idle");
  });

  it("recovers once, then fails when the retry is silent too", () => {
    const recover = vi.fn();
    const { result, rerender } = setup(recover);
    act(() => void vi.advanceTimersByTime(30_000));
    expect(recover).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe("recovering");
    // The page stops the request and resends: ready, then submitted again.
    rerender({ status: "ready" });
    rerender({ status: "submitted" });
    act(() => void vi.advanceTimersByTime(30_000));
    expect(recover).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe("failed");
  });

  it("clears when the answer streams", () => {
    const recover = vi.fn();
    const { result, rerender } = setup(recover);
    act(() => void vi.advanceTimersByTime(30_000));
    rerender({ status: "streaming" });
    expect(result.current.phase).toBe("idle");
    rerender({ status: "submitted" });
    act(() => void vi.advanceTimersByTime(30_000));
    expect(recover).toHaveBeenCalledTimes(2);
  });

  it("fails when recovering throws", async () => {
    const { result } = setup(vi.fn().mockRejectedValue(new Error("no")));
    await act(async () => void vi.advanceTimersByTime(30_000));
    expect(result.current.phase).toBe("failed");
  });
});
