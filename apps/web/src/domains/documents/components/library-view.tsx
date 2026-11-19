"use client";

import { FileText, Plus, Trash2 } from "lucide-react";
import Link from "next/link";

import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";

import { DeleteDocumentDialog } from "./delete-document-dialog";
import { useDocumentLabels } from "../hooks/use-document-labels";
import { useLibrary } from "../hooks/use-library";
import { LibraryResumeDialog } from "./library-resume-dialog";

/**
 * The Library (workspace spec): documents with no company behind them,
 * listed by focus, with a plain "New resume" action. Cover letters join
 * with their slice.
 */
export function LibraryView() {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const library = useLibrary();
  // The LinkedIn text has its own page.
  const documents = (library.data ?? [])
    .filter((document) => document.kind !== "linkedin")
    .sort((a, b) => a.focus.localeCompare(b.focus));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {t.formatMessage({
            defaultMessage:
              "Resumes with no company behind them, each titled by its focus. Openings suggest them when they fit.",
          })}
        </p>
        <div className="flex gap-2">
          <LibraryResumeDialog
            trigger={
              <Button size="sm">
                <Plus />
                {t.formatMessage({ defaultMessage: "New resume" })}
              </Button>
            }
          />
        </div>
      </div>
      {library.data && documents.length === 0 && (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {t.formatMessage({
            defaultMessage:
              "No library documents yet. Start with a “General” resume, written from your published profile.",
          })}
        </p>
      )}
      <ul className="grid gap-2">
        {documents.map((document) => (
          <li
            key={document.id}
            className="bg-background hover:border-primary flex items-center gap-1 rounded-lg border pr-2"
          >
            <Link
              href={`/app/library/${document.id}`}
              className="flex flex-1 items-center justify-between p-3"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <FileText className="size-4" />
                {document.focus}
              </span>
              <span className="flex gap-1">
                {document.languages.map((language) => (
                  <Badge key={language} variant="secondary">
                    {labels.language(language)}
                  </Badge>
                ))}
              </span>
            </Link>
            <DeleteDocumentDialog
              documentId={document.id}
              trigger={
                <Button
                  size="icon"
                  variant="ghost"
                  title={t.formatMessage({ defaultMessage: "Delete document" })}
                >
                  <Trash2 />
                </Button>
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
