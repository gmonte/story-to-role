"use client";

import { Check } from "lucide-react";

import {
  linkedinProficiencies,
  type LinkedinProficiency,
  proficiencyLabel,
} from "@repo/api/domains/documents/linkedin/linkedin-proficiency";
import type { OutputLanguage } from "@repo/api/domains/documents/schemas/document";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/web/components/ui/select";
import { cn } from "@repo/web/lib/utils";

import { useDocumentEditor } from "./document-editor-context";

/**
 * The headline options the AI wrote (resume spec, "LinkedIn"): the chosen
 * one is marked, and Use this makes another the headline, keeping its
 * trace; the headline itself is edited in the text.
 */
export function HeadlineOptions() {
  const t = useTranslation();
  const { content, saveContent, saveStatus } = useDocumentEditor();
  if (content.kind !== "linkedin" || content.headlineOptions.length < 2) {
    return null;
  }
  const chosen = content.headline?.id;
  return (
    <section className="bg-card flex flex-col gap-1.5 rounded-lg border p-3">
      <h3 className="text-muted-foreground text-xs font-medium">
        {t.formatMessage({ defaultMessage: "Headline options" })}
      </h3>
      <ul className="flex flex-col gap-1">
        {content.headlineOptions.map((option) => {
          const isChosen = option.id === chosen;
          return (
            <li
              key={option.id}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm",
                isChosen && "bg-primary/10"
              )}
            >
              <span>{option.text}</span>
              {isChosen ? (
                <span className="text-primary flex shrink-0 items-center gap-1 text-xs font-medium">
                  <Check className="size-3.5" />
                  {t.formatMessage({ defaultMessage: "Chosen" })}
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  disabled={saveStatus === "saving"}
                  onClick={() =>
                    saveContent((current) =>
                      current.kind === "linkedin"
                        ? { ...current, headline: option }
                        : current
                    )
                  }
                >
                  {t.formatMessage({ defaultMessage: "Use this" })}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Languages whose level couldn't be read on LinkedIn's scale: the user
 * picks the level LinkedIn offers, which the text then prints.
 */
export function LanguageLevels({ language }: { language: OutputLanguage }) {
  const t = useTranslation();
  const { content, saveContent, saveStatus } = useDocumentEditor();
  if (content.kind !== "linkedin") return null;
  const unread = content.languages.filter((row) => !row.proficiency);
  if (!unread.length) return null;
  const pick = (credentialId: string, proficiency: LinkedinProficiency) =>
    saveContent((current) =>
      current.kind === "linkedin"
        ? {
            ...current,
            languages: current.languages.map((row) =>
              row.credentialId === credentialId ? { ...row, proficiency } : row
            ),
          }
        : current
    );
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
      <span>
        {t.formatMessage({
          defaultMessage:
            "LinkedIn asks for a level from its own scale. Pick one for:",
        })}
      </span>
      {unread.map((row) => (
        <div key={row.credentialId} className="flex items-center gap-2">
          <span className="font-medium">
            {row.level
              ? t.formatMessage(
                  { defaultMessage: "{language} ({level})" },
                  { language: row.title, level: row.level }
                )
              : row.title}
          </span>
          <Select
            disabled={saveStatus === "saving"}
            onValueChange={(value) =>
              pick(row.credentialId, value as LinkedinProficiency)
            }
          >
            <SelectTrigger size="sm" className="bg-background h-7 text-xs">
              <SelectValue
                placeholder={t.formatMessage({
                  defaultMessage: "Choose the level",
                })}
              />
            </SelectTrigger>
            <SelectContent>
              {linkedinProficiencies.map((proficiency) => (
                <SelectItem key={proficiency} value={proficiency}>
                  {proficiencyLabel(proficiency, language)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </section>
  );
}
