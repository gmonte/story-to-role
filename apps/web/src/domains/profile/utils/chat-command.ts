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

export type CommandMenuState = { index: number; closed: boolean };

export const initialCommandMenu: CommandMenuState = {
  index: 0,
  closed: false,
};

export type CommandMenuResult = {
  state: CommandMenuState;
  /** The key was used by the menu: the composer must not handle it. */
  handled: boolean;
  /** Enter runs the picked command; Tab only completes the text. */
  pick?: { command: string; run: boolean };
};

/**
 * What a key does while the slash-command list is open. `commands` is the
 * filtered list; an empty one means the menu is not open and nothing is handled.
 */
export function reduceCommandMenu(
  state: CommandMenuState,
  key: string,
  commands: readonly string[]
): CommandMenuResult {
  const idle = { state, handled: false };
  if (state.closed || commands.length === 0) return idle;
  const index = Math.min(state.index, commands.length - 1);
  switch (key) {
    case "ArrowDown":
      return {
        state: { ...state, index: (index + 1) % commands.length },
        handled: true,
      };
    case "ArrowUp":
      return {
        state: {
          ...state,
          index: (index - 1 + commands.length) % commands.length,
        },
        handled: true,
      };
    case "Enter":
      return {
        state,
        handled: true,
        pick: { command: commands[index], run: true },
      };
    case "Tab":
      return {
        state,
        handled: true,
        pick: { command: commands[index], run: false },
      };
    case "Escape":
      return { state: { ...state, closed: true }, handled: true };
    default:
      return idle;
  }
}
