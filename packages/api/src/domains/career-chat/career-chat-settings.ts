/** The career chat's limits (ADR 0007), in one place. */
export const careerChatSettings = {
  // The Trigger.dev session's retention deadline; its messages in our tables
  // are purged on the same clock.
  retentionDays: 7,
  // A session this close to its deadline isn't handed out for a new turn.
  expiryMarginMs: 3_600_000,
  // The orchestrator's view of the conversation: the interviewers keep their
  // own turns, a short window keeps replies coherent.
  historyWindow: 8,
  // Model steps per turn: consult, then answer (with room for a retry).
  maxSteps: 4,
  // The turn's reservation covers two interviewers beside the orchestrator.
  maxConsultsPerTurn: 2,
};

export const dayMs = 86_400_000;
