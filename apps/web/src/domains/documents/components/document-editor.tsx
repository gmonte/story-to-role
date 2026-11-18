"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { EditorContent } from "@tiptap/react";
import { Sparkles } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";

import { FindingHoverCard } from "~/domains/profile/components/finding-hover-card";

import { linesById } from "../utils/document-blocks";
import { useFindingLabel } from "./coverage-review";
import { ProfileActionButton } from "./document-findings";
import { useDocumentAgent } from "./document-agent-context";
import { useDocumentEditor } from "./document-editor-context";
import { TraceContent, TraceHoverCard } from "./line-trace";

/**
 * The document in its PDF look (resume spec, "Document workspace"), a page
 * in the middle of the screen: everything but the section titles and the
 * credentials is editable in place, every line shows its origin and its
 * trace on hover, and a finding's card opens over its underline with Fix,
 * Talk to the agent and Ignore. Selected text gets a floating button that
 * sends the passage to the agent.
 */
export function DocumentEditor() {
  const t = useTranslation();
  const label = useFindingLabel();
  const agent = useDocumentAgent();
  const wrapper = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{
    text: string;
    left: number;
    top: number;
  } | null>(null);
  const {
    editor,
    version,
    content,
    findings,
    notes,
    fixFor,
    profileActionFor,
    ignoreFinding,
    ignoreNote,
  } = useDocumentEditor();
  const lines = useMemo(() => linesById(content), [content]);

  // Selected text gets a floating bar whose button sends the passage to
  // the agent, as in the profile.
  useEffect(() => {
    if (!editor || !agent) return;
    const update = () => {
      const { from, to, empty } = editor.state.selection;
      const box = wrapper.current?.getBoundingClientRect();
      const text = empty ? "" : editor.state.doc.textBetween(from, to, "\n");
      if (!text.trim() || !box || !editor.isFocused) return setSelection(null);
      const start = editor.view.coordsAtPos(from);
      setSelection({
        text: text.trim(),
        left: Math.max(start.left - box.left, 24),
        top: start.top - box.top - 36,
      });
    };
    editor.on("selectionUpdate", update);
    editor.on("blur", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("blur", update);
    };
  }, [editor, agent]);

  // Only the section titles, the credentials and a very old experience's
  // note aren't the user's to type over.
  const lockedNotes: Record<string, string> = {
    sectionTitle: t.formatMessage({
      defaultMessage: "Section titles follow your template.",
    }),
    credential: t.formatMessage({
      defaultMessage: "A credential, as your profile states it.",
    }),
    entryNote: t.formatMessage({
      defaultMessage:
        "The requirement this experience was kept for; change it in the settings.",
    }),
  };

  return (
    <div
      ref={wrapper}
      className="relative mx-auto w-full max-w-[52rem] px-6 py-6"
    >
      {selection && agent && (
        <button
          type="button"
          className="bg-popover text-popover-foreground hover:bg-accent absolute z-20 flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium shadow-md"
          style={{ left: selection.left, top: selection.top }}
          // The selection stays while the button is pressed.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            agent.talkAbout({ quote: selection.text });
            setSelection(null);
          }}
        >
          <Sparkles className="text-primary size-3.5" />
          {t.formatMessage({ defaultMessage: "Talk about this" })}
        </button>
      )}
      <article className="bg-background rounded-lg border px-12 py-10 shadow-sm">
        <EditorContent editor={editor} />
      </article>
      <TraceHoverCard
        editor={editor}
        describe={(element) => {
          const lineId = element.dataset.traceMarker;
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
            return {
              message: note.text,
              talk: agent
                ? () =>
                    agent.talkAbout({
                      quote: note.lineText,
                      attachment: { kind: "review", text: note.text },
                    })
                : undefined,
              ignore: () => ignoreNote(note),
            };
          }
          const finding = findings[index];
          if (!finding) return null;
          const message = label(finding, version);
          return {
            message,
            fix: fixFor(finding) ?? undefined,
            extra: <ProfileActionButton action={profileActionFor(finding)} />,
            talk: agent
              ? () =>
                  agent.talkAbout({
                    quote: finding.lineId
                      ? (lines.get(finding.lineId)?.text ?? null)
                      : null,
                    attachment: { kind: "finding", text: message },
                  })
              : undefined,
            ignore: () => ignoreFinding(finding),
          };
        }}
      />
    </div>
  );
}
