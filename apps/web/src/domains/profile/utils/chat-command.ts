/** Typed alone in the composer, these start a new conversation. */
export const clearCommands = ["/clear", "/limpar"] as const;

export function isClearCommand(text: string) {
  const typed = text.trim().toLowerCase();
  return clearCommands.some((command) => command === typed);
}

/** The commands the typed text is the start of, for the composer's hint. */
export function matchingCommands(text: string) {
  const typed = text.trim().toLowerCase();
  if (!typed.startsWith("/")) return [];
  return clearCommands.filter((command) => command.startsWith(typed));
}

const modifierKeys = [
  "Shift",
  "Control",
  "Meta",
  "Alt",
  "AltGraph",
  "CapsLock",
];

export type ClearKeyDecision = "send" | "arm" | "confirm" | "cancel" | "ignore";

/**
 * What a key does in the composer while the /clear command waits for its
 * second Enter. `armed` is true after the first Enter on the command.
 */
export function decideClearKey(
  armed: boolean,
  key: string,
  shiftKey: boolean
): ClearKeyDecision {
  if (!armed) return key === "Enter" && !shiftKey ? "send" : "ignore";
  if (modifierKeys.includes(key)) return "ignore";
  return key === "Enter" && !shiftKey ? "confirm" : "cancel";
}
