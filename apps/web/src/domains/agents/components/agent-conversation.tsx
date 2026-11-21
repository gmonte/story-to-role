"use client";

import {
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import type { UIMessage } from "ai";
import {
  ArrowUp,
  Loader2,
  MessageSquarePlus,
  Quote,
  Sparkles,
  Square,
  X,
} from "lucide-react";

import {
  splitAgentMessage,
  type AgentAttachment,
} from "@repo/api/domains/agents/agent-message";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/web/components/ui/dialog";
import { Textarea } from "@repo/web/components/ui/textarea";
import { cn } from "@repo/web/lib/utils";

import { VoiceInputButton } from "~/domains/career/components/voice-input-button";
import { CreditCost } from "~/domains/credits/components/credit-cost";

import type { WatchdogPhase } from "../hooks/use-answer-watchdog";
import {
  decideClearKey,
  initialCommandMenu,
  isClearCommand,
  matchingCommands,
  reduceCommandMenu,
} from "../utils/chat-command";

/**
 * The bar above a conversation that has messages, with New conversation
 * and its confirmation. `description` says what the agent keeps.
 */
export function NewConversationBar({
  show,
  description,
  starting,
  onConfirm,
}: {
  show: boolean;
  description: string;
  starting: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslation();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      {show && (
        <div className="flex justify-end border-b px-3 py-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setConfirming(true)}
          >
            <MessageSquarePlus />
            {t.formatMessage({ defaultMessage: "New conversation" })}
          </Button>
        </div>
      )}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t.formatMessage({ defaultMessage: "Start a new conversation?" })}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={starting}
              onClick={() => setConfirming(false)}
            >
              {t.formatMessage({ defaultMessage: "Cancel" })}
            </Button>
            <Button
              disabled={starting}
              onClick={() => {
                setConfirming(false);
                onConfirm();
              }}
            >
              {starting && <Loader2 className="animate-spin" />}
              {t.formatMessage({ defaultMessage: "New conversation" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** What the agent is doing right now, in words: never a still label. */
export function ActivityRow({
  phase,
  activity,
}: {
  phase: WatchdogPhase;
  activity: string;
}) {
  const t = useTranslation();
  return (
    <li
      role="status"
      className="text-muted-foreground flex items-center gap-2 self-start text-sm"
    >
      <Sparkles className="text-brand-accent size-4 motion-safe:animate-pulse" />
      <span className="from-foreground via-muted-foreground to-foreground motion-safe:animate-shimmer bg-linear-to-r bg-[length:200%_100%] bg-clip-text text-transparent">
        {phase === "recovering"
          ? t.formatMessage({ defaultMessage: "Reconnecting to the agent…" })
          : activity}
      </span>
    </li>
  );
}

/** The answer never came, after one recovery: the user decides. */
export function FailedRow({ onRetry }: { onRetry: () => void }) {
  const t = useTranslation();
  return (
    <li
      role="alert"
      className="text-destructive flex flex-col items-start gap-2 self-start text-sm"
    >
      {t.formatMessage({
        defaultMessage:
          "The agent didn't answer. Check your connection and try again.",
      })}
      <Button size="sm" variant="outline" onClick={onRetry}>
        {t.formatMessage({ defaultMessage: "Try again" })}
      </Button>
    </li>
  );
}

/** A stream error: the agent's own message is English-only. */
export function ErrorRow() {
  const t = useTranslation();
  return (
    <li className="text-destructive self-start text-sm">
      {t.formatMessage({
        defaultMessage:
          "Something went wrong with this answer. Please send it again.",
      })}
    </li>
  );
}

/** What an attachment is called, by its kind. */
export function useAttachmentLabel() {
  const t = useTranslation();
  return (kind: AgentAttachment["kind"]) =>
    kind === "finding"
      ? t.formatMessage({
          defaultMessage: "Finding",
          description: "Label of a linter finding attached to a chat message",
        })
      : kind === "reviewer"
        ? t.formatMessage({
            defaultMessage: "Reviewer feedback",
            description: "Label of a reviewer's feedback attached to a message",
          })
        : t.formatMessage({
            defaultMessage: "Review",
            description: "Label of a quality-review note attached to a message",
          });
}

/** The user's message: the passage it is about, where from, then their words. */
export function UserMessage({
  message,
  from,
}: {
  message: UIMessage;
  /** Where the quoted passage is from (its part's title), if known. */
  from?: (part: string) => string;
}) {
  const { quote, part, attachment, text } = splitAgentMessage(
    message.parts
      .flatMap((piece) => (piece.type === "text" ? [piece.text] : []))
      .join("")
  );
  const attachmentLabel = useAttachmentLabel();
  const origin = part && from ? from(part) : "";
  return (
    <li className="bg-muted max-w-[90%] self-end rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap">
      {quote && (
        <span className="text-muted-foreground mb-1 block border-l-2 pl-2 text-xs">
          {origin && <span className="block font-medium">{origin}</span>}
          <span className="line-clamp-3">{quote}</span>
        </span>
      )}
      {attachment && (
        <span className="text-muted-foreground mb-1 block border-l-2 pl-2 text-xs">
          <span className="block font-medium">
            {attachmentLabel(attachment.kind)}
          </span>
          <span className="line-clamp-3">{attachment.text}</span>
        </span>
      )}
      {text}
    </li>
  );
}

/** The passage the next message is about, above the composer. */
export function QuoteCard({
  title,
  quote,
  removeLabel,
  onRemove,
}: {
  title?: string;
  quote: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <div className="bg-muted/60 mb-2 flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs">
      <Quote className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        {title && (
          <span className="text-muted-foreground block font-medium">
            {title}
          </span>
        )}
        <span className="line-clamp-3 whitespace-pre-wrap">{quote}</span>
      </span>
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** The finding or review note the next message is about, above the composer. */
export function AttachmentCard({
  attachment,
  onRemove,
}: {
  attachment: AgentAttachment;
  onRemove: () => void;
}) {
  const t = useTranslation();
  const attachmentLabel = useAttachmentLabel();
  return (
    <div className="bg-muted/60 mb-2 flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs">
      <Sparkles className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="text-muted-foreground block font-medium">
          {attachmentLabel(attachment.kind)}
        </span>
        <span className="text-muted-foreground line-clamp-3 whitespace-pre-wrap">
          {attachment.text}
        </span>
      </span>
      <button
        type="button"
        aria-label={t.formatMessage({
          defaultMessage: "Remove the attachment",
        })}
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * The composer every agent shares: the cards above it (a quote, an
 * attachment), the slash-command menu with its autocomplete, /clear's
 * inline confirmation, the text, and the row with the cost, the agent's
 * own actions, voice input and Send or Stop.
 */
export function AgentComposer({
  id,
  inputRef,
  text,
  setText,
  onSend,
  onStartNew,
  busy,
  canSend,
  placeholder,
  maxLength,
  cost,
  nearReserve,
  onStop,
  cards,
  actionsStart,
  actionsEnd,
}: {
  // Distinguishes the composers' listboxes on a page.
  id: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  text: string;
  setText: (text: string) => void;
  onSend: (words: string) => void;
  onStartNew: () => void;
  busy: boolean;
  // Whether what is composed can be sent (an attachment alone can).
  canSend: boolean;
  placeholder: string;
  maxLength: number;
  cost: number | undefined;
  nearReserve?: boolean;
  onStop: () => void;
  cards?: ReactNode;
  actionsStart?: ReactNode;
  actionsEnd?: ReactNode;
}) {
  const t = useTranslation();
  // /clear was sent once: a second Enter confirms, any other key cancels.
  const [clearArmed, setClearArmed] = useState(false);
  const [menu, setMenu] = useState(initialCommandMenu);
  const commands = clearArmed ? [] : matchingCommands(text);
  const menuOpen = commands.length > 0 && !menu.closed;
  const activeIndex = Math.min(menu.index, Math.max(commands.length - 1, 0));
  const optionId = (command: string) => `${id}-command-${command.slice(1)}`;

  function send(words: string) {
    // The command starts a new conversation; the agent never sees it.
    if (isClearCommand(words)) {
      setClearArmed(true);
      return;
    }
    onSend(words);
  }

  function onSubmit(event: FormEvent | KeyboardEvent) {
    event.preventDefault();
    send(text);
  }

  return (
    <form onSubmit={onSubmit} className="border-t p-3">
      {nearReserve && (
        <p className="text-warning mb-2 text-xs">
          {t.formatMessage({
            defaultMessage:
              "Your credits are close to the reserve kept for your resume.",
          })}
        </p>
      )}
      {cards}
      {menuOpen && (
        <ul
          id={`${id}-command-list`}
          role="listbox"
          className="bg-card mb-2 rounded-md border text-xs shadow-sm"
        >
          {commands.map((command, index) => (
            <li
              key={command}
              id={optionId(command)}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setMenu((m) => ({ ...m, index }))}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setText(command);
                inputRef.current?.focus();
              }}
              className={cn(
                "flex w-full cursor-pointer items-baseline gap-2 px-2.5 py-1.5 text-left",
                index === activeIndex && "bg-muted"
              )}
            >
              <span className="font-mono font-medium">{command}</span>
              <span className="text-muted-foreground">
                {t.formatMessage({
                  defaultMessage: "Start a new conversation",
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {clearArmed && (
        <p className="text-muted-foreground mb-1.5 text-xs">
          {t.formatMessage({
            defaultMessage:
              "Press Enter again to delete this conversation. Any other key cancels.",
          })}
        </p>
      )}
      <div className="bg-card focus-within:border-ring/60 flex flex-col rounded-lg border transition-colors">
        <Textarea
          ref={inputRef}
          rows={2}
          value={text}
          maxLength={maxLength}
          role="combobox"
          aria-expanded={menuOpen}
          aria-controls={`${id}-command-list`}
          aria-autocomplete="list"
          aria-activedescendant={
            menuOpen ? optionId(commands[activeIndex]) : undefined
          }
          onChange={(event) => {
            setClearArmed(false);
            setMenu(initialCommandMenu);
            setText(event.target.value);
          }}
          onBlur={() => {
            if (!clearArmed) return;
            setClearArmed(false);
            setText("");
          }}
          onKeyDown={(event) => {
            const nav = reduceCommandMenu(menu, event.key, commands);
            if (nav.handled) {
              event.preventDefault();
              setMenu(nav.state);
              if (nav.pick) {
                setText(nav.pick.command);
                if (nav.pick.run) send(nav.pick.command);
              }
              return;
            }
            const decision = decideClearKey(
              clearArmed && isClearCommand(text),
              event.key,
              event.shiftKey
            );
            if (decision === "confirm") {
              event.preventDefault();
              setClearArmed(false);
              onStartNew();
            } else if (decision === "cancel") {
              // The key is not swallowed: it types into the emptied box.
              setClearArmed(false);
              setText("");
            } else if (decision === "send") onSubmit(event);
          }}
          placeholder={placeholder}
          className="max-h-40 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        {/* Below the text, not over it: a long message scrolls clear of it. */}
        <div className="flex items-center gap-1 pr-2 pb-2 pl-3">
          <CreditCost credits={cost} />
          {actionsStart}
          <span className="mr-auto" />
          {actionsEnd}
          <VoiceInputButton
            language={t.locale === "pt-BR" ? "pt-BR" : "en-US"}
            value={text}
            onValueChange={setText}
          />
          {busy ? (
            // Stops the answer being written; what was said so far stays.
            <Button
              type="button"
              size="icon"
              className="size-8 rounded-full"
              aria-label={t.formatMessage({ defaultMessage: "Stop" })}
              title={t.formatMessage({ defaultMessage: "Stop" })}
              onClick={onStop}
            >
              <Square className="size-3 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!canSend}
              className="size-8 rounded-full"
              aria-label={t.formatMessage({ defaultMessage: "Send" })}
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

/**
 * The stored messages, then the local ones the store doesn't have yet (just
 * streamed, saved a moment later); an empty one the answer never filled
 * goes.
 */
export function withStored(local: UIMessage[], stored: UIMessage[]) {
  const ids = new Set(stored.map((message) => message.id));
  return [
    ...stored,
    ...local.filter(
      (message) => !ids.has(message.id) && message.parts.length > 0
    ),
  ];
}
