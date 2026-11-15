"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import type {
  ResumeHeaderFields,
  StyleProfile,
  TemplateSection,
} from "@repo/api/domains/documents/schemas/template";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
import { Input } from "@repo/web/components/ui/input";
import { Label } from "@repo/web/components/ui/label";
import { toast } from "@repo/web/components/ui/sonner";
import { Textarea } from "@repo/web/components/ui/textarea";

import { useTRPC } from "~/tools/trpc/client";

import { useDocumentLabels } from "../hooks/use-document-labels";

const list = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * The global template (sections and their code-checked conditions), the
 * header printed on every document, and the style profile.
 */
export function WritingSettings() {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const setup = useQuery({
    ...trpc.writing.get.queryOptions({}),
    refetchInterval: (query) =>
      query.state.data?.styleStatus === "extracting" ? 2000 : false,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trpc.writing.pathKey() });

  if (!setup.data) return null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 p-6">
        <TemplateForm
          sections={setup.data.templateSections}
          header={setup.data.header}
          onSaved={refresh}
        />
        <StyleForm
          // A new extraction brings a new draft to review.
          key={`${setup.data.styleStatus}:${JSON.stringify(setup.data.styleDraft)}`}
          status={setup.data.styleStatus}
          draft={setup.data.styleDraft}
          onChanged={refresh}
        />
        <p className="text-muted-foreground text-xs">
          {t.formatMessage({
            defaultMessage:
              "No resume includes a photo, age or marital status. To add that kind of detail, ask for it in an opening's instructions.",
          })}
        </p>
      </div>
    </div>
  );
}

function TemplateForm({
  sections: initialSections,
  header: initialHeader,
  onSaved,
}: {
  sections: TemplateSection[];
  header: ResumeHeaderFields;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const trpc = useTRPC();
  const [sections, setSections] = useState(initialSections);
  const [header, setHeader] = useState(initialHeader);
  const save = useMutation(
    trpc.writing.updateTemplate.mutationOptions({
      onSuccess: async () => {
        await onSaved();
        toast.success(t.formatMessage({ defaultMessage: "Template saved." }));
      },
      onError: (error) => toast.error(error.message),
    })
  );
  const patch = (index: number, changes: Partial<TemplateSection>) =>
    setSections(
      sections.map((section, i) =>
        i === index ? { ...section, ...changes } : section
      )
    );

  const headerFields: Array<{ key: keyof ResumeHeaderFields; label: string }> =
    [
      { key: "name", label: t.formatMessage({ defaultMessage: "Name" }) },
      { key: "email", label: t.formatMessage({ defaultMessage: "Email" }) },
      { key: "phone", label: t.formatMessage({ defaultMessage: "Phone" }) },
      {
        key: "linkedin",
        label: t.formatMessage({ defaultMessage: "LinkedIn" }),
      },
      { key: "github", label: t.formatMessage({ defaultMessage: "GitHub" }) },
      { key: "city", label: t.formatMessage({ defaultMessage: "City" }) },
    ];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">
            {t.formatMessage({ defaultMessage: "Header" })}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t.formatMessage({
              defaultMessage:
                "Printed at the top of every resume and cover letter. The name here is the one on your documents.",
            })}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {headerFields.map((field) => (
            <div key={field.key} className="grid gap-1.5">
              <Label htmlFor={`header-${field.key}`}>{field.label}</Label>
              <Input
                id={`header-${field.key}`}
                value={header[field.key]}
                onChange={(event) =>
                  setHeader({ ...header, [field.key]: event.target.value })
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">
            {t.formatMessage({ defaultMessage: "Resume sections" })}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t.formatMessage({
              defaultMessage:
                "Optional sections start off so resumes fit in two pages. Conditions are checked as written: leave them empty to always include the section.",
            })}
          </p>
        </div>
        <ul className="flex flex-col gap-2">
          {sections.map((section, index) => (
            <li
              key={section.kind}
              className="flex flex-col gap-2 rounded-lg border p-3"
            >
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={section.enabled}
                  onCheckedChange={(checked) =>
                    patch(index, { enabled: checked === true })
                  }
                />
                {labels.section(section.kind)}
              </label>
              {section.enabled && (
                <div className="grid gap-2 pl-6 sm:grid-cols-2">
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {t.formatMessage({ defaultMessage: "Only in:" })}
                    </span>
                    {(["en-US", "pt-BR"] as const).map((language) => (
                      <label key={language} className="flex items-center gap-1">
                        <Checkbox
                          checked={section.languages.includes(language)}
                          onCheckedChange={(checked) =>
                            patch(index, {
                              languages: checked
                                ? [...section.languages, language]
                                : section.languages.filter(
                                    (l) => l !== language
                                  ),
                            })
                          }
                        />
                        {labels.language(language)}
                      </label>
                    ))}
                  </div>
                  <Input
                    className="h-8 text-xs"
                    placeholder={t.formatMessage({
                      defaultMessage:
                        "Only when the opening mentions (comma-separated)",
                    })}
                    defaultValue={section.keywords.join(", ")}
                    onBlur={(event) =>
                      patch(index, { keywords: list(event.target.value) })
                    }
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Button
        className="self-start"
        disabled={save.isPending}
        onClick={() => save.mutate({ sections, header })}
      >
        {t.formatMessage({ defaultMessage: "Save template" })}
      </Button>
    </div>
  );
}

function StyleForm({
  status,
  draft,
  onChanged,
}: {
  status: "none" | "extracting" | "draft" | "approved";
  draft: StyleProfile | null;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const [samples, setSamples] = useState(["", "", ""]);
  const [profile, setProfile] = useState(draft);
  const extract = useMutation(
    trpc.writing.extractStyle.mutationOptions({
      onSuccess: onChanged,
      onError: (error) => toast.error(error.message),
    })
  );
  const approve = useMutation(
    trpc.writing.approveStyle.mutationOptions({
      onSuccess: async () => {
        await onChanged();
        toast.success(
          t.formatMessage({ defaultMessage: "Style profile approved." })
        );
      },
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-xl font-semibold">
          {t.formatMessage({ defaultMessage: "Writing style" })}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t.formatMessage({
            defaultMessage:
              "Paste up to three samples of your own writing (an old cover letter, a post, a resume you like). With none, your interview answers serve as the sample. Only how you write is kept, never sentences or facts.",
          })}
        </p>
      </div>
      {samples.map((sample, index) => (
        <Textarea
          key={index}
          rows={3}
          value={sample}
          placeholder={t.formatMessage(
            { defaultMessage: "Sample {number} (optional)" },
            { number: index + 1 }
          )}
          onChange={(event) =>
            setSamples(
              samples.map((value, i) =>
                i === index ? event.target.value : value
              )
            )
          }
        />
      ))}
      <Button
        variant="outline"
        className="self-start"
        disabled={extract.isPending || status === "extracting"}
        onClick={() =>
          extract.mutate({ samples: samples.filter((s) => s.trim()) })
        }
      >
        {status === "extracting" && <Loader2 className="animate-spin" />}
        {t.formatMessage({ defaultMessage: "Extract my style" })}
      </Button>

      {profile && status !== "extracting" && (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-sm font-medium">
            {status === "approved"
              ? t.formatMessage({
                  defaultMessage: "Your approved style profile",
                })
              : t.formatMessage({
                  defaultMessage: "Review your style profile, then approve it",
                })}
          </p>
          {(
            [
              [
                "sentenceLength",
                t.formatMessage({ defaultMessage: "Sentence length" }),
              ],
              ["formality", t.formatMessage({ defaultMessage: "Formality" })],
              [
                "firstPerson",
                t.formatMessage({ defaultMessage: "First person" }),
              ],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="grid gap-1.5">
              <Label>{label}</Label>
              <Input
                value={profile[key]}
                onChange={(event) =>
                  setProfile({ ...profile, [key]: event.target.value })
                }
              />
            </div>
          ))}
          {(
            [
              [
                "preferredVocabulary",
                t.formatMessage({ defaultMessage: "Preferred vocabulary" }),
              ],
              [
                "wordsToAvoid",
                t.formatMessage({ defaultMessage: "Words to avoid" }),
              ],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="grid gap-1.5">
              <Label>{label}</Label>
              <Input
                defaultValue={profile[key].join(", ")}
                onBlur={(event) =>
                  setProfile({ ...profile, [key]: list(event.target.value) })
                }
              />
            </div>
          ))}
          <Button
            className="self-start"
            disabled={approve.isPending}
            onClick={() => approve.mutate({ style: profile })}
          >
            {t.formatMessage({ defaultMessage: "Approve style profile" })}
          </Button>
        </div>
      )}
    </section>
  );
}
