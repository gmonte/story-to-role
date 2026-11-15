"use client";

import { useRef, useState } from "react";

import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { FileUp } from "lucide-react";

import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import type { Timeline } from "@repo/api/domains/career/schemas/timeline";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";

import { useRefreshCareer } from "../hooks/use-career-queries";

const ACCEPT =
  ".pdf,.docx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain";

/**
 * Imports resumes (PDF or DOCX) and truth files at any time. Each runs in a
 * task; the timeline refreshes when it finishes.
 */
export function ImportDocuments({
  documents,
}: {
  documents: Timeline["documents"];
}) {
  const t = useTranslation();
  const refresh = useRefreshCareer();
  const resumeInput = useRef<HTMLInputElement>(null);
  const truthInput = useRef<HTMLInputElement>(null);
  const [running, setRunning] = useState<RealtimeSubscription[]>([]);

  async function upload(file: File, kind: "resume" | "truth_file") {
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", file);
    const response = await fetch("/api/career/documents", {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      toast.error(
        t.formatMessage({
          defaultMessage:
            "That file couldn't be imported. Use a PDF, DOCX or text file up to 5 MB.",
        })
      );
      return;
    }
    const { realtime } = (await response.json()) as {
      realtime: RealtimeSubscription;
    };
    setRunning((current) => [...current, realtime]);
    await refresh();
  }

  const reasonLabel = (reason: string | null) => {
    switch (reason) {
      case "not_a_career_document":
        return t.formatMessage({
          defaultMessage: "Doesn't look like a resume",
        });
      case "too_many_pages":
        return t.formatMessage({ defaultMessage: "Too many pages" });
      case "too_long":
        return t.formatMessage({ defaultMessage: "Too long" });
      case "too_short":
        return t.formatMessage({ defaultMessage: "Too short" });
      default:
        return t.formatMessage({ defaultMessage: "Couldn't be read" });
    }
  };

  const statusLabel = (document: Timeline["documents"][number]) => {
    switch (document.status) {
      case "pending":
      case "processing":
        return t.formatMessage({ defaultMessage: "Reading…" });
      case "processed":
        return t.formatMessage({ defaultMessage: "Imported" });
      case "rejected":
        return reasonLabel(document.rejectionReason);
      case "failed":
        return t.formatMessage({ defaultMessage: "Failed" });
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        {t.formatMessage({ defaultMessage: "Import" })}
      </h3>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => resumeInput.current?.click()}
        >
          <FileUp />
          {t.formatMessage({ defaultMessage: "Resume" })}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => truthInput.current?.click()}
        >
          <FileUp />
          {t.formatMessage({ defaultMessage: "Truth file" })}
        </Button>
      </div>
      {[
        { ref: resumeInput, kind: "resume" as const },
        { ref: truthInput, kind: "truth_file" as const },
      ].map(({ ref, kind }) => (
        <input
          key={kind}
          ref={ref}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(event) => {
            for (const file of Array.from(event.target.files ?? []))
              void upload(file, kind);
            event.target.value = "";
          }}
        />
      ))}
      {running.map((run) => (
        <RunWatcher
          key={run.runId}
          {...run}
          onDone={() => {
            setRunning((current) =>
              current.filter((r) => r.runId !== run.runId)
            );
            void refresh();
          }}
        />
      ))}
      <ul className="flex flex-col gap-1">
        {documents.map((document) => (
          <li
            key={document.id}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span className="truncate">{document.fileName}</span>
            <Badge
              variant={
                document.status === "rejected" ? "destructive" : "outline"
              }
            >
              {statusLabel(document)}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RunWatcher({
  runId,
  accessToken,
  onDone,
}: RealtimeSubscription & { onDone: () => void }) {
  useRealtimeRun(runId, { accessToken, onComplete: () => onDone() });
  return null;
}
