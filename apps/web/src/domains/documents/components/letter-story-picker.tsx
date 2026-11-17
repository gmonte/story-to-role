"use client";

import { useQuery } from "@tanstack/react-query";

import type { LetterStoryView } from "@repo/api/domains/documents/schemas/letter-story";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import {
  RadioGroup,
  RadioGroupItem,
} from "@repo/web/components/ui/radio-group";

import { useTRPC } from "~/tools/trpc/client";

/** The profile's top three stories for an opening's cover letter. */
export function useLetterStories(openingId: string, enabled = true) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.letters.stories.queryOptions({ openingId }),
    enabled,
  });
}

/** The story the letter tells: the first one comes chosen. */
export const chosenStory = (
  stories: LetterStoryView[] | undefined,
  picked: string | null
) =>
  stories?.find((story) => story.lineId === picked)?.lineId ??
  stories?.[0]?.lineId ??
  null;

/**
 * The stories of the published profile that fit the opening best (resume
 * spec, "Cover letter inputs"): the user picks the one the letter tells,
 * seeing the requirements each answers.
 */
export function LetterStoryPicker({
  stories,
  value,
  onChange,
}: {
  stories: LetterStoryView[];
  value: string | null;
  onChange: (lineId: string) => void;
}) {
  const t = useTranslation();
  if (stories.length === 0) return null;
  return (
    <RadioGroup
      value={chosenStory(stories, value) ?? ""}
      onValueChange={onChange}
      className="grid gap-2"
    >
      {stories.map((story) => (
        <label
          key={story.lineId}
          className="flex items-start gap-2 rounded-md border p-2.5 text-sm"
        >
          <RadioGroupItem value={story.lineId} className="mt-0.5" />
          <span className="flex min-w-0 flex-col gap-1">
            <span>{story.text}</span>
            {story.position && (
              <span className="text-muted-foreground text-xs">
                {t.formatMessage(
                  { defaultMessage: "{title} at {employer}" },
                  {
                    title: story.position.title,
                    employer: story.position.employer,
                  }
                )}
              </span>
            )}
            {story.fits.length === 0 ? (
              <span className="text-muted-foreground text-xs">
                {t.formatMessage({
                  defaultMessage: "Close to what the opening asks for.",
                })}
              </span>
            ) : (
              <span className="flex flex-wrap items-center gap-1">
                <span className="text-muted-foreground text-xs">
                  {t.formatMessage({ defaultMessage: "Fits:" })}
                </span>
                {story.fits.map((fit) => (
                  <Badge key={fit} variant="secondary" className="text-xs">
                    {fit}
                  </Badge>
                ))}
              </span>
            )}
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}
