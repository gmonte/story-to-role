"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Sparkles } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/web/components/ui/dialog";
import { toast } from "@repo/web/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/web/components/ui/tooltip";

import { CreditCost } from "~/domains/credits/components/credit-cost";
import { useCredits } from "~/domains/credits/hooks/use-credits";
import { useTRPC } from "~/tools/trpc/client";

import { useRefreshDocuments } from "../hooks/use-opening-documents";
import { hasWarnings } from "../utils/version-checks";
import { useDocumentEditor } from "./document-editor-context";
import { LinkedinStepQuestions } from "./linkedin-step-questions";
import { WarningsDialog } from "./warnings-dialog";

type Row = {
  index: number;
  title: string;
  // What Copy text copies (`linkedin.sectionText`), when there is any.
  copy: string | null;
  // The section Generate this section again writes, when the AI writes it.
  redo: string | null;
  children: Row[];
};

/**
 * The LinkedIn text's index (resume spec, "LinkedIn"): its sections in
 * LinkedIn's order and, under them, each experience, project and
 * education, every one with Copy text for what LinkedIn takes there and,
 * where the AI writes it, Generate this section again. A dot marks a
 * section with a finding.
 */
export function LinkedinIndex({
  busy,
}: {
  /** A generation is running: nothing is written again meanwhile. */
  busy: boolean;
}) {
  const t = useTranslation();
  const { blocks, content, findings, goToBlock } = useDocumentEditor();
  if (content.kind !== "linkedin") return null;

  const rows: Row[] = [];
  blocks.forEach((block, index) => {
    if (block.type === "sectionTitle") {
      // A section copied whole; the others copy each entry under them.
      const copy =
        block.kind === "headline"
          ? content.headline
            ? "headline"
            : null
          : block.kind === "about"
            ? "about"
            : block.kind === "certifications" || block.kind === "languages"
              ? block.kind
              : null;
      const redo =
        block.kind === "headline" || block.kind === "about" ? block.kind : null;
      rows.push({ index, title: block.text, copy, redo, children: [] });
      return;
    }
    const parent = rows[rows.length - 1];
    if (block.type === "entry") {
      const title = blocks.find(
        (row) => row.type === "entryTitle" && row.ownerId === block.ownerId
      );
      parent?.children.push({
        index,
        title:
          title && "text" in title
            ? t.formatMessage(
                { defaultMessage: "{employer} — {title}" },
                { employer: block.text, title: title.text }
              )
            : block.text,
        copy: block.ownerId,
        redo: block.ownerId,
        children: [],
      });
    }
    if (block.type === "credential" && parent) {
      const education = content.education.find(
        (row) => row.credentialId === block.credentialId
      );
      if (education) {
        parent.children.push({
          index,
          title: education.title,
          copy: education.description ? education.credentialId : null,
          redo: education.credentialId,
          children: [],
        });
      }
    }
  });

  const flagged = new Set(
    findings.flatMap((finding) => {
      const at = blocks.findIndex((block) =>
        finding.lineId
          ? "lineId" in block && block.lineId === finding.lineId
          : finding.positionId
            ? block.type === "entry" && block.ownerId === finding.positionId
            : false
      );
      return at >= 0 ? [at] : [];
    })
  );
  const hasFlag = (start: number, end: number) =>
    [...flagged].some((at) => at >= start && at < end);

  return (
    <nav aria-label={t.formatMessage({ defaultMessage: "Document index" })}>
      <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
        {t.formatMessage({ defaultMessage: "Sections" })}
      </p>
      <ul className="space-y-0.5 text-sm">
        {rows.map((row, position) => {
          const end = rows[position + 1]?.index ?? blocks.length;
          return (
            <li key={row.index}>
              <div className="group hover:bg-muted flex items-center gap-1 rounded pr-1">
                <button
                  type="button"
                  onClick={() => goToBlock(row.index + 1)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left"
                >
                  <span className="truncate">{row.title}</span>
                  {hasFlag(row.index, end) && (
                    <span className="bg-destructive size-1.5 shrink-0 rounded-full" />
                  )}
                </button>
                {row.redo && (
                  <RedoSectionButton section={row.redo} busy={busy} />
                )}
                {row.copy && <CopyTextButton section={row.copy} />}
              </div>
              {row.children.length > 0 && (
                <ul className="border-muted ml-3 border-l pl-2">
                  {row.children.map((child) => (
                    <li
                      key={child.index}
                      className="group hover:bg-muted flex items-center gap-1 rounded pr-1"
                    >
                      <button
                        type="button"
                        onClick={() => goToBlock(child.index)}
                        className="text-muted-foreground hover:text-foreground min-w-0 flex-1 truncate px-2 py-0.5 text-left text-xs"
                      >
                        {child.title}
                      </button>
                      {child.redo && (
                        <RedoSectionButton section={child.redo} busy={busy} />
                      )}
                      {child.copy && <CopyTextButton section={child.copy} />}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Copies one section's text to paste on LinkedIn. It waits for the edits
 * to be saved, and asks for a confirmation while the text has findings.
 */
function CopyTextButton({ section }: { section: string }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { version, saveStatus } = useDocumentEditor();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const label = t.formatMessage({ defaultMessage: "Copy text" });
  const copy = async (acknowledgeWarnings?: boolean) => {
    setPending(true);
    try {
      const { text } = await queryClient.fetchQuery({
        ...trpc.linkedin.sectionText.queryOptions({
          versionId: version.id,
          section,
          acknowledgeWarnings,
        }),
        staleTime: 0,
      });
      await navigator.clipboard.writeText(text);
      toast.success(t.formatMessage({ defaultMessage: "Copied." }));
    } catch {
      toast.error(
        t.formatMessage({
          defaultMessage:
            "This text couldn't be copied. Check the coverage review.",
        })
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-6 shrink-0 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={label}
            disabled={pending || saveStatus !== "saved"}
            onClick={() =>
              hasWarnings(version) ? setConfirming(true) : void copy()
            }
          >
            <Copy className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <WarningsDialog
        open={confirming}
        onOpenChange={setConfirming}
        confirmLabel={t.formatMessage({ defaultMessage: "Copy anyway" })}
        onConfirm={() => void copy(true)}
      />
    </>
  );
}

/**
 * Generate this section again (resume spec, "LinkedIn"): the section's
 * step alone, its questions and earlier answers, then that section
 * rewritten from the profile the text froze, as a new snapshot that leaves
 * the other sections and their edits alone.
 */
function RedoSectionButton({
  section,
  busy,
}: {
  section: string;
  busy: boolean;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const credits = useCredits();
  const { version, saveStatus } = useDocumentEditor();
  const [open, setOpen] = useState(false);
  const label = t.formatMessage({
    defaultMessage: "Generate this section again",
  });
  const redo = useMutation(
    trpc.linkedin.regenerateSection.mutationOptions({
      onSuccess: async () => {
        setOpen(false);
        await refresh();
      },
      onError: (error) => toast.error(error.message),
    })
  );
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-6 shrink-0 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={label}
            disabled={busy || saveStatus !== "saved"}
            onClick={() => setOpen(true)}
          >
            <Sparkles className="text-brand-accent size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              {t.formatMessage({
                defaultMessage:
                  "The AI writes this section again from your profile and your answers. The other sections, and your edits in them, stay as they are; Undo brings this one back.",
              })}
            </DialogDescription>
          </DialogHeader>
          <LinkedinStepQuestions
            versionId={version.id}
            section={section}
            disabled={busy || saveStatus !== "saved"}
          />
          <DialogFooter className="items-center gap-2">
            <CreditCost credits={credits.data?.estimates.adaptation} />
            <DialogClose asChild>
              <Button variant="ghost">
                {t.formatMessage({ defaultMessage: "Cancel" })}
              </Button>
            </DialogClose>
            <Button
              disabled={redo.isPending}
              onClick={() => redo.mutate({ versionId: version.id, section })}
            >
              <Sparkles className="text-brand-accent" />
              {t.formatMessage({ defaultMessage: "Generate again" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
