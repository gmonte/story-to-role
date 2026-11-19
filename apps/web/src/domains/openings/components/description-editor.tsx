"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { useTranslation } from "@repo/intl/use-translation";
import { cn } from "@repo/web/lib/utils";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshOpenings } from "../hooks/use-opening";
import { docToMarkdown, markdownToDoc } from "../utils/description-markdown";

// How long the user pauses before the description is saved.
const saveDelayMs = 800;

type Status = "saved" | "pending" | "saving" | "error";

/**
 * The opening's description, free to edit: paragraphs, headings, lists and
 * bold or italic through Markdown shortcuts, saved as Markdown a moment
 * after the user pauses. Nothing runs again by itself: a fit check made on
 * the old text just reads as outdated.
 */
export function DescriptionEditor({
  openingId,
  initial,
}: {
  openingId: string;
  initial: string;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshOpenings();
  const { mutateAsync: save } = useMutation(
    trpc.openings.updateDescription.mutationOptions()
  );
  const [status, setStatus] = useState<Status>("saved");
  const saved = useRef(initial);
  const latest = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inFlight = useRef(false);

  const flush = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      while (latest.current !== saved.current) {
        const description = latest.current;
        setStatus("saving");
        await save({ openingId, description });
        saved.current = description;
      }
      setStatus("saved");
      await refresh();
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openingId, save]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
        strike: false,
        underline: false,
        heading: { levels: [1, 2, 3] },
      }),
    ],
    content: markdownToDoc(initial),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "description-editor focus:outline-none",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: current, transaction }) => {
      if (!transaction.docChanged) return;
      latest.current = docToMarkdown(current.getJSON());
      if (latest.current === saved.current) return;
      setStatus("pending");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), saveDelayMs);
    },
  });

  // Leaving the page saves what is still waiting for its pause.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (latest.current !== saved.current) void flush();
    },
    [flush]
  );

  const label = {
    saved: t.formatMessage({ defaultMessage: "Saved" }),
    pending: t.formatMessage({ defaultMessage: "Editing…" }),
    saving: t.formatMessage({ defaultMessage: "Saving…" }),
    error: t.formatMessage({
      defaultMessage: "Not saved: check your connection",
    }),
  }[status];

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">
          {t.formatMessage({ defaultMessage: "Description" })}
        </h2>
        <span
          className={cn(
            "text-xs",
            status === "error" ? "text-destructive" : "text-muted-foreground"
          )}
          aria-live="polite"
        >
          {label}
        </span>
      </div>
      <EditorContent editor={editor} />
    </section>
  );
}
