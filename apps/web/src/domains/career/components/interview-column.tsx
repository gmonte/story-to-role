"use client";

import { useEffect } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useTimeline } from "../hooks/use-career-queries";
import { useCareerWorkspace } from "./career-workspace-context";
import { InterviewChat } from "./interview-chat";
import { InterviewLanguageSelect } from "./interview-language-select";
import { PrivacyNotice } from "./privacy-notice";

/**
 * The chat column of My career: the privacy notice first, then the
 * interview of whichever position is open (most recent first by default).
 */
export function InterviewColumn() {
  const t = useTranslation();
  const trpc = useTRPC();
  const timeline = useTimeline();
  const openSessions = useQuery(trpc.interview.openSessions.queryOptions({}));
  const { activeSessionId, setActiveSessionId } = useCareerWorkspace();

  const open = useMutation(
    trpc.interview.openSession.mutationOptions({
      onSuccess: ({ sessionId }) => setActiveSessionId(sessionId),
      onError: (error) => toast.error(error.message),
    })
  );

  // Come back anytime: resume the session left open.
  useEffect(() => {
    if (!activeSessionId && openSessions.data?.[0]) {
      setActiveSessionId(openSessions.data[0].sessionId);
    }
  }, [activeSessionId, openSessions.data, setActiveSessionId]);

  if (!timeline.data) return null;
  const { profile, positions } = timeline.data;

  if (!profile.privacyNoticeAccepted) {
    return <PrivacyNotice interviewLanguage={profile.interviewLanguage} />;
  }

  if (activeSessionId) {
    return (
      <InterviewChat
        key={activeSessionId}
        sessionId={activeSessionId}
        interviewLanguage={profile.interviewLanguage}
      />
    );
  }

  const next = positions.find((p) => p.status !== "approved");

  return (
    <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="font-display text-2xl font-semibold tracking-tight">
        {t.formatMessage({ defaultMessage: "Your career story" })}
      </h2>
      <p className="text-muted-foreground text-sm">
        {t.formatMessage({
          defaultMessage:
            "The interview goes through your positions one at a time and turns what you tell it into evidence you approve.",
        })}
      </p>
      {next ? (
        <Button
          disabled={open.isPending}
          onClick={() => open.mutate({ positionId: next.id })}
        >
          {t.formatMessage(
            { defaultMessage: "Start with {title} at {employer}" },
            { title: next.title, employer: next.employer }
          )}
        </Button>
      ) : positions.length === 0 ? (
        <Button
          variant="outline"
          disabled={open.isPending}
          onClick={() => open.mutate({})}
        >
          {t.formatMessage({ defaultMessage: "I have no positions yet" })}
        </Button>
      ) : null}
      <div className="flex w-full flex-col gap-1.5 text-left">
        <span className="text-muted-foreground text-xs">
          {t.formatMessage({ defaultMessage: "Interview language" })}
        </span>
        <InterviewLanguageSelect value={profile.interviewLanguage} />
      </div>
    </div>
  );
}
