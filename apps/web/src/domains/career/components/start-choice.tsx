"use client";

import { useEffect } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";
import { BriefcaseBusiness, Target } from "lucide-react";
import { useRouter } from "next/navigation";

import type { StartPath } from "@repo/api/domains/career/schemas/career";
import { useTranslation } from "@repo/intl/use-translation";
import { toast } from "@repo/web/components/ui/sonner";
import { cn } from "@repo/web/lib/utils";

import { useTRPC } from "~/tools/trpc/client";

/** Where each path continues. */
const destinations: Record<StartPath, string> = {
  opening: "/app/start/opening",
  career: "/app/career",
};

/**
 * Right after sign-up (workspace spec, "Onboarding"): the user chooses how
 * to start. Anyone who has started already goes straight on.
 */
export function StartChoice() {
  const t = useTranslation();
  const trpc = useTRPC();
  const router = useRouter();
  const start = useQuery(trpc.career.start.queryOptions({}));
  const choose = useMutation(
    trpc.career.chooseStart.mutationOptions({
      onSuccess: (_, { path }) => router.push(destinations[path]),
      onError: (error) => toast.error(error.message),
    })
  );

  const state = start.data;
  // The guided opening path resumes until its first opening exists.
  const resume =
    state?.path === "opening" && !state.hasOpening
      ? destinations.opening
      : state?.path || state?.hasStarted
        ? destinations.career
        : null;
  useEffect(() => {
    if (resume) router.replace(resume);
  }, [resume, router]);

  if (!state || resume) return null;

  const options: Array<{
    path: StartPath;
    icon: typeof Target;
    title: string;
    description: string;
    highlighted?: boolean;
  }> = [
    {
      path: "opening",
      icon: Target,
      highlighted: true,
      title: t.formatMessage({ defaultMessage: "I have an opening in mind" }),
      description: t.formatMessage({
        defaultMessage:
          "Bring your current resume (or start without one), add the opening, see how you fit right away, answer a few questions about what it needs, and get your resume.",
      }),
    },
    {
      path: "career",
      icon: BriefcaseBusiness,
      title: t.formatMessage({
        defaultMessage: "I want to organize my career first",
      }),
      description: t.formatMessage({
        defaultMessage:
          "Import your files and tell your story position by position in the career interview. Openings come after.",
      }),
    },
  ];

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-2 text-center">
        <h2 className="font-display text-3xl font-semibold tracking-tight">
          {t.formatMessage({ defaultMessage: "How do you want to start?" })}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t.formatMessage({
            defaultMessage:
              "Either way, everything ends up in your career story, and you can do the other later.",
          })}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <button
            key={option.path}
            type="button"
            disabled={choose.isPending}
            onClick={() => choose.mutate({ path: option.path })}
            className={cn(
              "bg-background hover:border-primary flex flex-col gap-2 rounded-xl border p-5 text-left transition-colors",
              option.highlighted && "border-primary ring-primary/20 ring-4"
            )}
          >
            <option.icon className="text-primary size-6" />
            <span className="font-medium">{option.title}</span>
            <span className="text-muted-foreground text-sm">
              {option.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
