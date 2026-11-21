"use client";

import { useEffect } from "react";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import { cn } from "@repo/web/lib/utils";

import { CreditCost } from "~/domains/credits/components/credit-cost";
import { useCredits } from "~/domains/credits/hooks/use-credits";
import { useTRPC } from "~/tools/trpc/client";

import { useRefreshDocuments } from "../hooks/use-opening-documents";
import type { LinkedinStep, LinkedinStepKey } from "../utils/linkedin-steps";
import { useDocumentEditor } from "./document-editor-context";
import { LinkedinStepQuestions } from "./linkedin-step-questions";

/** Each step's name and what it writes, in the interface's language. */
function useStepLabels() {
  const t = useTranslation();
  const names: Record<LinkedinStepKey, string> = {
    headline: t.formatMessage({ defaultMessage: "Headline" }),
    about: t.formatMessage({ defaultMessage: "About" }),
    experiences: t.formatMessage({ defaultMessage: "Experiences" }),
    projects: t.formatMessage({ defaultMessage: "Projects" }),
    education: t.formatMessage({ defaultMessage: "Education" }),
    credentials: t.formatMessage({
      defaultMessage: "Certifications and languages",
    }),
  };
  const details: Record<LinkedinStepKey, string> = {
    headline: t.formatMessage({
      defaultMessage:
        "3 to 5 headline options of up to 220 characters: how you define yourself professionally, your main area and what you bring. You choose one and edit it.",
    }),
    about: t.formatMessage({
      defaultMessage:
        "Your About in the first person: who you are and what you deliver, the proof of each employer, and a closing line with your strongest areas.",
    }),
    experiences: t.formatMessage({
      defaultMessage:
        "Every position, new or old, with its key achievements in 3 to 4 bullets.",
    }),
    projects: t.formatMessage({
      defaultMessage: "Every project, with its key achievements in bullets.",
    }),
    education: t.formatMessage({
      defaultMessage:
        "A short description of each education, only where your profile tells something about it.",
    }),
    credentials: t.formatMessage({
      defaultMessage:
        "Printed from your profile, no AI: check them and pick the LinkedIn level of a language it couldn't read. Finishing reviews the whole text.",
    }),
  };
  return { names, details };
}

/**
 * The guided flow's steps (resume spec, "LinkedIn", "Step by step"), in
 * the left column while the text is written: Goal done, then one step per
 * section, a check on each one written.
 */
export function LinkedinStepList({
  steps,
  current,
  onSelect,
}: {
  steps: LinkedinStep[];
  current: LinkedinStepKey;
  onSelect: (step: LinkedinStepKey) => void;
}) {
  const t = useTranslation();
  const { names } = useStepLabels();
  return (
    <nav aria-label={t.formatMessage({ defaultMessage: "Steps" })}>
      <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
        {t.formatMessage({ defaultMessage: "Steps" })}
      </p>
      <ol className="space-y-0.5 text-sm">
        <li className="text-muted-foreground flex items-center gap-2 px-2 py-1">
          <StepMark done number={1} />
          {t.formatMessage({ defaultMessage: "Goal" })}
        </li>
        {steps.map((step, index) => (
          <li key={step.key}>
            <button
              type="button"
              onClick={() => onSelect(step.key)}
              className={cn(
                "hover:bg-muted flex w-full items-center gap-2 rounded px-2 py-1 text-left",
                step.key === current && "bg-muted font-medium"
              )}
            >
              <StepMark done={step.written} number={index + 2} />
              <span className="truncate">{names[step.key]}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function StepMark({ done, number }: { done: boolean; number: number }) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border text-xs",
        done && "bg-primary border-primary text-primary-foreground"
      )}
    >
      {done ? <Check className="size-3" /> : number}
    </span>
  );
}

/**
 * The current step, under the steps: what it writes, its questions, Write
 * this section
 * (priced as an adjustment) or Write again, Back and Next; the last step
 * finishes with the coverage review, priced as Review again.
 */
export function LinkedinStepCard({
  steps,
  current,
  onSelect,
  busy,
}: {
  steps: LinkedinStep[];
  current: LinkedinStepKey;
  onSelect: (step: LinkedinStepKey) => void;
  /** A generation is running: nothing is written meanwhile. */
  busy: boolean;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const credits = useCredits();
  const { version, saveStatus, blocks, goToBlock } = useDocumentEditor();
  const { names, details } = useStepLabels();
  const at = steps.findIndex((step) => step.key === current);
  const step = steps[at];

  // The section of the current step comes into view.
  useEffect(() => {
    const index = blocks.findIndex(
      (block) => block.type === "sectionTitle" && block.kind === step?.blockKind
    );
    if (index >= 0) goToBlock(index + 1);
    // Only when the step changes, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const onError = (error: { message: string }) => toast.error(error.message);
  const write = useMutation(
    trpc.linkedin.regenerateSection.mutationOptions({
      onSuccess: () => refresh(),
      onError,
    })
  );
  const finish = useMutation(
    trpc.linkedin.review.mutationOptions({
      onSuccess: () => refresh(),
      onError,
    })
  );
  if (!step) return null;
  const blocked = busy || saveStatus !== "saved";
  const previous = steps[at - 1];
  const next = steps[at + 1];

  return (
    <section className="bg-card flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs">
          {t.formatMessage(
            { defaultMessage: "Step {step} of {total}" },
            { step: at + 2, total: steps.length + 1 }
          )}
        </p>
        <h3 className="font-semibold">{names[step.key]}</h3>
        <p className="text-muted-foreground text-sm">{details[step.key]}</p>
      </div>
      {step.section && (
        <LinkedinStepQuestions
          key={step.section}
          versionId={version.id}
          section={step.section}
          disabled={blocked}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {step.section ? (
          <>
            <Button
              size="sm"
              variant={step.written ? "outline" : "default"}
              disabled={blocked || write.isPending}
              onClick={() =>
                write.mutate({ versionId: version.id, section: step.section! })
              }
            >
              <Sparkles className="text-brand-accent" />
              {step.written
                ? t.formatMessage({ defaultMessage: "Write again" })
                : t.formatMessage({ defaultMessage: "Write this section" })}
            </Button>
            <CreditCost credits={credits.data?.estimates.adaptation} />
          </>
        ) : (
          <>
            <Button
              size="sm"
              disabled={blocked || finish.isPending}
              onClick={() => finish.mutate({ versionId: version.id })}
            >
              <Check />
              {t.formatMessage({ defaultMessage: "Finish" })}
            </Button>
            <CreditCost credits={credits.data?.estimates.reReview} />
          </>
        )}
      </div>
      <div className="flex items-center justify-between border-t pt-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={!previous}
          onClick={() => previous && onSelect(previous.key)}
        >
          <ArrowLeft />
          {t.formatMessage({ defaultMessage: "Back" })}
        </Button>
        {next && (
          <Button size="sm" variant="ghost" onClick={() => onSelect(next.key)}>
            {t.formatMessage({ defaultMessage: "Next" })}
            <ArrowRight />
          </Button>
        )}
      </div>
    </section>
  );
}
