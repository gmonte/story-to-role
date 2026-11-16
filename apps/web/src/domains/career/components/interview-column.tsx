"use client";

import { useTimeline } from "../hooks/use-career-queries";
import { CareerChat } from "./career-chat";
import { PrivacyNotice } from "./privacy-notice";

/**
 * The chat column of My career: the privacy notice first, then the one
 * career conversation (a position under review opens beside it).
 */
export function InterviewColumn() {
  const timeline = useTimeline();

  if (!timeline.data) return null;
  const { profile, positions } = timeline.data;

  if (!profile.privacyNoticeAccepted) {
    return <PrivacyNotice />;
  }

  return (
    <CareerChat
      interviewLanguage={profile.interviewLanguage}
      hasPositions={positions.length > 0}
    />
  );
}
