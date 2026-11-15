"use client";

import { useEffect, useRef, useState } from "react";

import { Mic, MicOff } from "lucide-react";

import type { InterviewLanguage } from "@repo/api/domains/career/schemas/career";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/web/components/ui/tooltip";

// The Web Speech API's on-device recognition isn't in TypeScript's DOM lib.
type Availability =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable";
type RecognitionOptions = { langs: string[]; processLocally: boolean };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally: boolean;
  start(): void;
  stop(): void;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type RecognitionClass = {
  new (): Recognition;
  available?: (options: RecognitionOptions) => Promise<Availability>;
  install?: (options: RecognitionOptions) => Promise<boolean>;
};

function getRecognitionClass(): RecognitionClass | undefined {
  const scope = globalThis as unknown as {
    SpeechRecognition?: RecognitionClass;
    webkitSpeechRecognition?: RecognitionClass;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

/**
 * Speech to text on the user's device only (guided interview spec): the
 * transcript lands in the input box to edit before sending, and audio never
 * leaves the device. Without on-device recognition, the button becomes a
 * hint on using the operating system's own dictation.
 */
export function VoiceInputButton({
  language,
  onTranscript,
}: {
  language: InterviewLanguage;
  onTranscript: (text: string) => void;
}) {
  const t = useTranslation();
  const [state, setState] = useState<
    "checking" | "ready" | "listening" | "unavailable"
  >("checking");
  const recognition = useRef<Recognition | null>(null);

  // Feature detection only: availability is asked when the user taps the
  // microphone, never on load (the check itself can be heavy for a browser).
  useEffect(() => {
    void Promise.resolve(
      getRecognitionClass()?.available
        ? ("ready" as const)
        : ("unavailable" as const)
    ).then(setState);
  }, []);

  async function toggle() {
    if (state === "listening") {
      recognition.current?.stop();
      return;
    }
    const RecognitionClass = getRecognitionClass();
    if (!RecognitionClass) return;
    const options = { langs: [language], processLocally: true };
    setState("checking");
    const availability = await RecognitionClass.available?.(options).catch(
      () => "unavailable" as const
    );
    // The language pack downloads once, on the first tap.
    const ready =
      availability === "available" ||
      ((availability === "downloadable" || availability === "downloading") &&
        (await RecognitionClass.install?.(options).catch(() => false)));
    if (!ready) {
      setState("unavailable");
      return;
    }
    const instance = new RecognitionClass();
    instance.lang = language;
    instance.processLocally = true;
    instance.continuous = true;
    instance.interimResults = false;
    instance.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) onTranscript(text);
    };
    instance.onend = () => setState("ready");
    instance.onerror = () => setState("ready");
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
            className="size-8"
            aria-label={t.formatMessage({ defaultMessage: "Dictation" })}
          >
            <MicOff />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {t.formatMessage({
            defaultMessage:
              "Use your system's dictation to speak: Fn Fn on macOS, Win+H on Windows, or the keyboard microphone on your phone.",
          })}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      type="button"
      size="icon"
      variant={state === "listening" ? "default" : "ghost"}
      className="size-8"
      disabled={state === "checking"}
      onClick={() => void toggle()}
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
