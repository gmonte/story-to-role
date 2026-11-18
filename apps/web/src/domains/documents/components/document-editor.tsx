"use client";

import { useMemo } from "react";

import { EditorContent } from "@tiptap/react";

import { useTranslation } from "@repo/intl/use-translation";

import { FindingHoverCard } from "~/domains/profile/components/finding-hover-card";

import { linesById } from "../utils/document-blocks";
import { useFindingLabel } from "./coverage-review";
import { useDocumentEditor } from "./document-editor-context";
import { TraceContent, TraceHoverCard } from "./line-trace";

/**
 * The document in its PDF look (resume spec, "Document workspace"), a page
 * in the middle of the screen: every line the user wrote is editable in
 * place, a line's trace shows on hover, and a finding's card opens over
 * its underline with Fix and Ignore.
 */
export function DocumentEditor() {
  const t = useTranslation();
  const label = useFindingLabel();
  const {
    editor,
    version,
    content,
    findings,
    notes,
    fixFor,
    canIgnore,
    ignoreFinding,
    ignoreNote,
  } = useDocumentEditor();
  const lines = useMemo(() => linesById(content), [content]);
  const lockedNotes: Record<string, string> = {
    name: t.formatMessage({
      defaultMessage: "Your header comes from your published profile.",
    }),
    titleLine: t.formatMessage({
      defaultMessage:
        "The target title and main technologies, from your published profile.",
    }),
    contacts: t.formatMessage({
      defaultMessage: "Your header comes from your published profile.",
    }),
    sectionTitle: t.formatMessage({
      defaultMessage: "Section titles follow your template.",
    }),
    entry: t.formatMessage({
      defaultMessage:
        "Employer, title and dates: locked facts, as your profile states them.",
    }),
    credential: t.formatMessage({
      defaultMessage: "A credential, as your profile states it.",
    }),
  };

  return (
    <div className="mx-auto w-full max-w-[52rem] px-6 py-6">
      <article className="bg-background rounded-lg border px-12 py-10 shadow-sm">
        <EditorContent editor={editor} />
      </article>
      <TraceHoverCard
        editor={editor}
        describe={(element) => {
          const lineId = element.dataset.lineId;
          if (lineId) {
            const line = lines.get(lineId);
            return (
              <TraceContent
                origin={line?.origin ?? { kind: "manual" }}
                version={version}
              />
            );
          }
          const locked = element.dataset.locked;
          return locked ? (lockedNotes[locked] ?? null) : null;
        }}
      />
      <FindingHoverCard
        editor={editor}
        describe={(key) => {
          const [group, number] = key.split("-");
          const index = Number(number);
          if (group === "note") {
            const note = notes[index];
            if (!note) return null;
            return { message: note.text, ignore: () => ignoreNote(note) };
          }
          const finding = findings[index];
          if (!finding) return null;
          return {
            message: label(finding, version),
            fix: fixFor(finding) ?? undefined,
            ignore: canIgnore(finding)
              ? () => ignoreFinding(finding)
              : undefined,
          };
        }}
      />
    </div>
  );
}
