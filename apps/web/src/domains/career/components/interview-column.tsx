"use client";

import { useEffect } from "react";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { useTRPC } from "~/tools/trpc/client";

import { useTimeline } from "../hooks/use-career-queries";
import { ApprovalScreen } from "./approval-screen";
import { CareerChat } from "./career-chat";
import { useCareerWorkspace } from "./career-workspace-context";
import { PrivacyNotice } from "./privacy-notice";

/**
 * The chat column of My career: the privacy notice first, then the one
 * career conversation, or the approval screen of a position under review.
 */
export function InterviewColumn() {
  const timeline = useTimeline();
  const { activeSessionId } = useCareerWorkspace();

  if (!timeline.data) return null;
  const { profile, positions } = timeline.data;

  if (!profile.privacyNoticeAccepted) {
    return <PrivacyNotice interviewLanguage={profile.interviewLanguage} />;
  }

  if (activeSessionId) return <SessionReview sessionId={activeSessionId} />;

  return (
    <CareerChat
      interviewLanguage={profile.interviewLanguage}
      hasPositions={positions.length > 0}
    />
  );
}

/** What one position's interviewer found, to approve, then back to the chat. */
function SessionReview({ sessionId }: { sessionId: string }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const { setActiveSessionId } = useCareerWorkspace();
  const session = useQuery(trpc.interview.session.queryOptions({ sessionId }));

  // Approved (the session closed): back to the conversation.
  const closed = !!session.data && session.data.status !== "open";
  useEffect(() => {
    if (closed) setActiveSessionId(null);
  }, [closed, setActiveSessionId]);
  if (closed) return null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 pt-4">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setActiveSessionId(null)}
        >
          <ArrowLeft />
          {t.formatMessage({ defaultMessage: "Back to the conversation" })}
        </Button>
      </div>
      {session.data && <ApprovalScreen session={session.data} />}
    </div>
  );
}
