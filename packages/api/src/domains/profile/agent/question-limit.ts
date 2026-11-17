import type { StreamTextTransform, ToolSet } from "ai";

/**
 * The method's interview asks at most three questions per message: a hard
 * rule, so code keeps it, not the prompt alone. The reply's text is cut
 * after its `max`-th question mark, across every step of the turn; tool
 * calls and everything else pass.
 */
export function limitQuestions<TOOLS extends ToolSet>(
  max: number
): StreamTextTransform<TOOLS> {
  return () => {
    let questions = 0;
    // "?!" and "??" are one question.
    let inQuestionMark = false;
    return new TransformStream({
      transform(chunk, controller) {
        if (chunk.type !== "text-delta") {
          controller.enqueue(chunk);
          return;
        }
        let kept = "";
        for (const char of chunk.text) {
          if (char === "?" || (inQuestionMark && char === "!")) {
            if (!inQuestionMark) questions++;
            inQuestionMark = true;
            if (questions <= max) kept += char;
            continue;
          }
          inQuestionMark = false;
          if (questions >= max) break;
          kept += char;
        }
        if (kept) controller.enqueue({ ...chunk, text: kept });
      },
    });
  };
}
