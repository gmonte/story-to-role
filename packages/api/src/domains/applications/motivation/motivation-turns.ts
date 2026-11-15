/** The turns' role, as the interview reads them. */
type Turn = { role: "question" | "answer" | "steer"; aboutStory: boolean };

/**
 * Answers that count: an answer followed by a fixed reply (off-topic, an
 * override attempt or a cooldown) counts for nothing. An answer is about
 * the story when the question it answers was.
 */
export function validAnswers<T extends Turn>(turns: T[]): T[] {
  return turns.flatMap((turn, index) => {
    if (turn.role !== "answer" || turns[index + 1]?.role === "steer") return [];
    const question = turns
      .slice(0, index)
      .reverse()
      .find((row) => row.role !== "answer");
    return [{ ...turn, aboutStory: question?.aboutStory ?? false }];
  });
}

/** Nothing asked yet, or an answer waits: the interviewer's turn. */
export const awaitingInterviewer = (turns: Turn[]) =>
  turns.length === 0 || turns.at(-1)!.role === "answer";
