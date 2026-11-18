/** The profile agent's limits (ADR 0007, AI platform spec), in one place. */
export const agentSettings = {
  // The Trigger.dev session's retention deadline; its messages in our tables
  // are purged on the same clock.
  retentionDays: 7,
  // A session this close to its deadline isn't handed out for a new turn.
  expiryMarginMs: 3_600_000,
  // The agent's view of the conversation: the profile itself holds what was
  // settled, a window keeps the interview coherent.
  historyWindow: 16,
  // Model steps per turn: read a part or two, suggest, then answer.
  maxSteps: 10,
  maxMessageCharacters: 6000,
  // The method's interview asks at most this many questions per message.
  maxQuestionsPerMessage: 3,
  // Per model call, thinking included: the model thinks before it answers,
  // and a tight limit spent on thinking left turns with no answer at all.
  maxOutputTokens: 8000,
};

export const dayMs = 86_400_000;
