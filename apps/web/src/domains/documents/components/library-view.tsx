"use client";

import { Briefcase, FileText, Plus } from "lucide-react";
import Link from "next/link";

import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";

import { useDocumentLabels } from "../hooks/use-document-labels";
import { useLibrary } from "../hooks/use-library";
import { LinkedinDialog } from "./linkedin-dialog";
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
  const documents = [...(library.data ?? [])].sort((a, b) =>
    a.focus.localeCompare(b.focus)
  );

  const hasLinkedin = documents.some(
    (document) => document.kind === "linkedin"
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {t.formatMessage({
            defaultMessage:
              "Resumes with no company behind them, each titled by its focus, and your LinkedIn text. Openings suggest the resumes when they fit.",
          })}
        </p>
        <div className="flex gap-2">
          {/* One LinkedIn text per user: new languages are versions of it. */}
          {library.data && !hasLinkedin && (
            <LinkedinDialog
              trigger={
                <Button size="sm" variant="outline">
                  <Briefcase />
                  {t.formatMessage({ defaultMessage: "LinkedIn text" })}
                </Button>
              }
            />
          )}
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
          <li key={document.id}>
            <Link
              href={`/app/library/${document.id}`}
              className="bg-background hover:border-primary flex items-center justify-between rounded-lg border p-3"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {document.kind === "linkedin" ? (
                  <Briefcase className="size-4" />
                ) : (
                  <FileText className="size-4" />
                )}
                {document.kind === "linkedin"
                  ? t.formatMessage({ defaultMessage: "LinkedIn text" })
                  : document.focus}
              </span>
              <span className="flex gap-1">
                {document.languages.map((language) => (
                  <Badge key={language} variant="secondary">
                    {labels.language(language)}
                  </Badge>
                ))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
