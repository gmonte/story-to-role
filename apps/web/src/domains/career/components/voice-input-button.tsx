"use client";

import { useEffect, useRef, useState } from "react";

import { Mic } from "lucide-react";

import type { InterviewLanguage } from "@repo/api/domains/career/schemas/career";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/web/components/ui/tooltip";
import { cn } from "@repo/web/lib/utils";

// The Web Speech API isn't in TypeScript's DOM lib.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onspeechstart: (() => void) | null;
  onresult:
    | ((event: {
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};
type RecognitionClass = new () => Recognition;

const SILENT_RECOGNIZER_MS = 6000;

function getRecognitionClass(): RecognitionClass | undefined {
  const scope = globalThis as unknown as {
    SpeechRecognition?: RecognitionClass;
    webkitSpeechRecognition?: RecognitionClass;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

/**
 * Speech to text by the browser's own recognition (guided interview spec):
 * Chrome, Edge and Safari transcribe with Google's or Apple's service, and
 * StoryToRole never receives the audio. The transcript lands in the input box
 * live, words appearing while the user speaks, to edit before sending. Where
 * the browser can't transcribe (Firefox has no recognition, Brave blocks it),
 * the button becomes a hint on using the operating system's own dictation,
 * shown on hover and as a toast on tap (a tooltip alone never reaches touch
 * screens).
 */
export function VoiceInputButton({
  language,
  value,
  onValueChange,
}: {
  language: InterviewLanguage;
  /** The input box's text: what is spoken is appended to it. */
  value: string;
  onValueChange: (value: string) => void;
}) {
  const t = useTranslation();
  const [state, setState] = useState<
    "checking" | "ready" | "listening" | "unavailable"
  >("checking");
  const recognition = useRef<Recognition | null>(null);
  // The input box's text when listening started: every result rewrites what
  // follows it, so a guess the recognizer revises never piles up.
  const typedBefore = useRef("");
  // A browser may hear speech and still never return a word: past this long
  // without text, recognition counts as unavailable.
  const silentRecognizer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const systemDictationHint = t.formatMessage({
    defaultMessage:
      "Use your system's dictation to speak: Fn Fn on macOS, Win+H on Windows, or the keyboard microphone on your phone.",
  });

  function showUnavailable() {
    setState("unavailable");
    toast.info(
      t.formatMessage({
        defaultMessage: "This browser can't transcribe your voice",
      }),
      { description: systemDictationHint }
    );
  }

  // Decided after mount: the server render can't know the browser.
  useEffect(() => {
    void Promise.resolve(
      getRecognitionClass() ? ("ready" as const) : ("unavailable" as const)
    ).then(setState);
  }, []);

  useEffect(
    () => () => {
      clearTimeout(silentRecognizer.current);
      recognition.current?.abort();
    },
    []
  );

  function toggle() {
    if (state === "listening") {
      // Chrome doesn't always fire "end" after a stop, so the button doesn't
      // wait for it.
      clearTimeout(silentRecognizer.current);
      recognition.current?.stop();
      setState("ready");
      return;
    }
    const RecognitionClass = getRecognitionClass();
    if (!RecognitionClass) return;
    const instance = new RecognitionClass();
    instance.lang = language;
    instance.continuous = true;
    instance.interimResults = true;
    typedBefore.current = value.trim();
    instance.onspeechstart = () => {
      silentRecognizer.current ??= setTimeout(() => {
        instance.onend = null;
        instance.onerror = null;
        instance.abort();
        showUnavailable();
      }, SILENT_RECOGNIZER_MS);
    };
    instance.onresult = (event) => {
      clearTimeout(silentRecognizer.current);
      instance.onspeechstart = null;
      // In continuous mode the results hold the whole session, final phrases
      // followed by the one still being guessed.
      const spoken = Array.from(event.results)
        .map((result) => result[0]?.transcript.trim() ?? "")
        .filter(Boolean)
        .join(" ");
      if (!spoken) return;
      onValueChange(
        typedBefore.current ? `${typedBefore.current} ${spoken}` : spoken
      );
    };
    instance.onend = () => {
      clearTimeout(silentRecognizer.current);
      setState("ready");
    };
    instance.onerror = (event) => {
      // "aborted" and "no-speech" are a stop or a silence, not a failure.
      if (event.error === "aborted" || event.error === "no-speech") return;
      if (event.error === "not-allowed") {
        setState("ready");
        toast.error(
          t.formatMessage({
            defaultMessage:
              "Allow microphone access for this site in your browser to speak your answer.",
          })
        );
        return;
      }
      showUnavailable();
    };
    clearTimeout(silentRecognizer.current);
    silentRecognizer.current = undefined;
    recognition.current = instance;
    instance.start();
    setState("listening");
  }

  if (state === "unavailable") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-muted-foreground size-8"
            onClick={showUnavailable}
            aria-label={t.formatMessage({
              defaultMessage: "Dictation unavailable in this browser",
            })}
          >
            <Mic />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {systemDictationHint}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      type="button"
      size="icon"
      variant={state === "listening" ? "default" : "ghost"}
      className={cn("size-8", state === "listening" && "animate-pulse")}
      disabled={state === "checking"}
      onClick={toggle}
      aria-label={
        state === "listening"
          ? t.formatMessage({ defaultMessage: "Stop dictation" })
          : t.formatMessage({ defaultMessage: "Speak your answer" })
      }
    >
      <Mic />
    </Button>
  );
}
