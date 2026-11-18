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
