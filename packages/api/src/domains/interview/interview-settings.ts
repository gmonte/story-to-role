/**
 * Interview thresholds (guided interview spec): settings to tune with real
 * usage, not fixed rules.
 */
export const interviewSettings = {
  // Past this many tokens of turns the interviewer proposes a checkpoint;
  // at twice as many it is mandatory.
  checkpointTokens: 20_000,
  maxMessageCharacters: 4_000,
  // Positions that ended longer ago than this get the short script.
  shortScriptAfterYears: 10,
  agentMaxIterations: 8,
  agentMaxTokens: 4_096,
};

/** A rough token count: about four characters per token. */
export function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}
