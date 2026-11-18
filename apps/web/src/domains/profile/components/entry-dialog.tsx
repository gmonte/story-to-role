"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { useTranslation } from "@repo/intl/use-translation";
import type {
  ProfileEntry,
  ProfileEntryKind,
} from "@repo/api/domains/profile/truth/insert";
import type { CompetencyLevel } from "@repo/api/domains/profile/truth/sections";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/web/components/ui/dialog";
import { Input } from "@repo/web/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/web/components/ui/select";

import { useProfileLabels } from "../hooks/use-profile-labels";

type Values = Record<string, string>;

/** A labelled field: the label wraps the input, so it names it. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

/**
 * Asks what the insert menu needs for one entry (profile spec, "Insert
 * menu"); the month and status pickers write the text in the template's
 * format.
 */
export function EntryDialog({
  kind,
  onClose,
  onInsert,
}: {
  kind: ProfileEntryKind | null;
  onClose: () => void;
  onInsert: (entry: ProfileEntry) => void;
}) {
  return (
    <Dialog open={!!kind} onOpenChange={(open) => !open && onClose()}>
      {kind && <EntryForm key={kind} kind={kind} onInsert={onInsert} />}
    </Dialog>
  );
}

function EntryForm({
  kind,
  onInsert,
}: {
  kind: ProfileEntryKind;
  onInsert: (entry: ProfileEntry) => void;
}) {
  const t = useTranslation();
  const { entryLabels } = useProfileLabels();
  const [values, setValues] = useState<Values>({
    status: "valid",
    level: "master",
    rule: "neverInclude",
    date: "",
  });
  const [current, setCurrent] = useState(false);
  const [inProgress, setInProgress] = useState(false);

  const set = (name: string) => (value: string) =>
    setValues((previous) => ({ ...previous, [name]: value }));
  const text = (name: string, label: string, required = true) => (
    <Field label={label}>
      <Input
        value={values[name] ?? ""}
        required={required}
        onChange={(event) => set(name)(event.target.value)}
      />
    </Field>
  );
  const month = (name: string, label: string, required = true) => (
    <Field label={label}>
      <Input
        type="month"
        value={values[name] ?? ""}
        required={required}
        onChange={(event) => set(name)(event.target.value)}
      />
    </Field>
  );

  function entry(): ProfileEntry | null {
    const v = (name: string) => (values[name] ?? "").trim();
    switch (kind) {
      case "experience":
        if (!current && v("end") && v("end") < v("start")) return null;
        return {
          kind,
          company: v("company"),
          title: v("title"),
          range: { start: v("start"), end: current ? "present" : v("end") },
        };
      case "education":
        return {
          kind,
          course: v("course"),
          institution: v("institution"),
          inProgressUntil: inProgress ? v("until") : null,
        };
      case "certification":
        return {
          kind,
          name: v("name"),
          issuer: v("issuer"),
          date: v("date"),
          status: v("status") as "valid" | "expired" | "renewing",
          expiredOn: v("status") === "expired" ? v("expiredOn") : null,
        };
      case "language":
        return { kind, language: v("language"), level: v("languageLevel") };
      case "competency":
        return { kind, name: v("name"), level: v("level") as CompetencyLevel };
      case "gap":
        return { kind, text: v("text") };
      case "rule":
        return {
          kind,
          rule: v("rule") as "neverInclude" | "neverClaim",
          text: v("text"),
        };
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = entry();
    if (value) onInsert(value);
  }

  const fields: Record<ProfileEntryKind, ReactNode> = {
    experience: (
      <>
        {text("company", t.formatMessage({ defaultMessage: "Company" }))}
        {text("title", t.formatMessage({ defaultMessage: "Title" }))}
        <div className="grid grid-cols-2 gap-3">
          {month("start", t.formatMessage({ defaultMessage: "Start" }))}
          {current ? (
            <Field label={t.formatMessage({ defaultMessage: "End" })}>
              <Input
                disabled
                value={t.formatMessage({ defaultMessage: "Present" })}
              />
            </Field>
          ) : (
            month("end", t.formatMessage({ defaultMessage: "End" }))
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={current}
            onCheckedChange={(c) => setCurrent(c === true)}
          />
          {t.formatMessage({ defaultMessage: "I work here now" })}
        </label>
      </>
    ),
    education: (
      <>
        {text("course", t.formatMessage({ defaultMessage: "Course" }))}
        {text(
          "institution",
          t.formatMessage({ defaultMessage: "Institution" })
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={inProgress}
            onCheckedChange={(c) => setInProgress(c === true)}
          />
          {t.formatMessage({ defaultMessage: "In progress" })}
        </label>
        {inProgress &&
          month(
            "until",
            t.formatMessage({ defaultMessage: "Expected to finish" })
          )}
      </>
    ),
    certification: (
      <>
        {text("name", t.formatMessage({ defaultMessage: "Name" }))}
        {text("issuer", t.formatMessage({ defaultMessage: "Issuer" }))}
        {month("date", t.formatMessage({ defaultMessage: "Issued" }))}
        <Field label={t.formatMessage({ defaultMessage: "Status" })}>
          <Select value={values.status} onValueChange={set("status")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="valid">
                {t.formatMessage({ defaultMessage: "Valid" })}
              </SelectItem>
              <SelectItem value="expired">
                {t.formatMessage({ defaultMessage: "Expired" })}
              </SelectItem>
              <SelectItem value="renewing">
                {t.formatMessage({ defaultMessage: "Renewing" })}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {values.status === "expired" &&
          month("expiredOn", t.formatMessage({ defaultMessage: "Expired in" }))}
      </>
    ),
    language: (
      <>
        {text("language", t.formatMessage({ defaultMessage: "Language" }))}
        {text(
          "languageLevel",
          t.formatMessage({
            defaultMessage:
              "Real level (e.g. native, fluent, technical reading)",
          })
        )}
      </>
    ),
    competency: (
      <>
        {text("name", t.formatMessage({ defaultMessage: "Competency" }))}
        <Field label={t.formatMessage({ defaultMessage: "Level" })}>
          <Select value={values.level} onValueChange={set("level")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="master">
                {t.formatMessage({ defaultMessage: "I master it" })}
              </SelectItem>
              <SelectItem value="often">
                {t.formatMessage({ defaultMessage: "I use it often" })}
              </SelectItem>
              <SelectItem value="occasional">
                {t.formatMessage({ defaultMessage: "Occasional experience" })}
              </SelectItem>
              <SelectItem value="studied">
                {t.formatMessage({
                  defaultMessage: "Studied, without professional experience",
                })}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </>
    ),
    gap: text(
      "text",
      t.formatMessage({ defaultMessage: "What you don't have or haven't done" })
    ),
    rule: (
      <>
        <Field label={t.formatMessage({ defaultMessage: "Rule" })}>
          <Select value={values.rule} onValueChange={set("rule")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="neverInclude">
                {t.formatMessage({ defaultMessage: "Never include" })}
              </SelectItem>
              <SelectItem value="neverClaim">
                {t.formatMessage({ defaultMessage: "Never claim" })}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {text(
          "text",
          t.formatMessage({
            defaultMessage: "Name, client, codename, figure or claim",
          })
        )}
      </>
    ),
  };

  return (
    // The editor places the cursor in the new entry; the dialog mustn't
    // take the focus back to where it was.
    <DialogContent onCloseAutoFocus={(event) => event.preventDefault()}>
      <form onSubmit={submit} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>
            {t.formatMessage(
              { defaultMessage: "Add: {entry}" },
              { entry: entryLabels[kind] }
            )}
          </DialogTitle>
          <DialogDescription>
            {t.formatMessage({
              defaultMessage:
                "It goes into its section, in the profile's format; you can edit it in the text afterwards.",
            })}
          </DialogDescription>
        </DialogHeader>
        {fields[kind]}
        <DialogFooter>
          <Button type="submit">
            {t.formatMessage({ defaultMessage: "Add" })}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
