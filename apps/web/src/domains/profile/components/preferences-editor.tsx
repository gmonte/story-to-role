"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EditorContent, useEditor } from "@tiptap/react";
import { Download, History, Loader2, Plus, Send, Wand2 } from "lucide-react";

import {
  addPreference,
  fixPreferencesFormat,
  lintPreferences,
  readPreferenceSections,
} from "@repo/api/domains/profile/preferences/preferences";
import type { ProfileDraft } from "@repo/api/domains/profile/schemas/profile";
import {
  parseBlocks,
  serializeBlocks,
  type ProfileBlock,
} from "@repo/api/domains/profile/truth/blocks";
import { hasFormatErrors } from "@repo/api/domains/profile/truth/lint";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/web/components/ui/dropdown-menu";
import { Input } from "@repo/web/components/ui/input";
import { toast } from "@repo/web/components/ui/sonner";
import { cn } from "@repo/web/lib/utils";

import { useTRPC } from "~/tools/trpc/client";
import { ResizableAside } from "~/domains/workspace/components/resizable-aside";

import {
  useDraftAutosave,
  useProfileDraftQuery,
} from "../hooks/use-profile-draft";
import { useProfileLabels } from "../hooks/use-profile-labels";
import { blockPositions, blocksToDoc, docToBlocks } from "../utils/editor-doc";
import {
  focusNodeEnd,
  profileExtensions,
  setDecorations,
  type EditorDecorationSpec,
  editorScrollMargins,
} from "../utils/editor-extensions";
import { DocumentSwitch } from "./document-switch";
import { FindingHoverCard } from "./finding-hover-card";
import { LinkHoverCard } from "./link-hover-card";
import { VersionsDialog } from "./versions-dialog";

const kind = "preferences" as const;
// Lint runs after the user pauses this long, not on every keystroke.
const lintDelayMs = 150;
const dot = "·";

type AddableSection =
  | "excludedCompanies"
  | "excludedSectors"
  | "locations"
  | "discardRules";

/**
 * The job preferences (profile spec, "Job preferences"): the same block
 * editor as the profile, with its own template and linter. Only screening
 * reads it, from its published version; there is nothing to validate.
 */
export function PreferencesEditor() {
  const draft = useProfileDraftQuery(kind);
  if (!draft.data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }
  return <Editor draft={draft.data} />;
}

function Editor({ draft }: { draft: ProfileDraft }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { findingMessage } = useProfileLabels();
  const autosave = useDraftAutosave(draft, kind);
  const [blocks, setBlocks] = useState(() => parseBlocks(draft.markdown));
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [adding, setAdding] = useState<AddableSection | null>(null);
  const [addText, setAddText] = useState("");
  const lintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const editor = useEditor({
    extensions: profileExtensions(),
    content: blocksToDoc(parseBlocks(draft.markdown)),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "profile-editor focus:outline-none",
        spellcheck: "true",
      },
      ...editorScrollMargins,
    },
    onUpdate: ({ editor: current, transaction }) => {
      if (!transaction.docChanged) return;
      clearTimeout(lintTimer.current);
      lintTimer.current = setTimeout(() => {
        const next = docToBlocks(current.state.doc);
        setBlocks(next);
        autosave.change(serializeBlocks(next));
      }, lintDelayMs);
    },
  });

  const findings = useMemo(() => lintPreferences(blocks), [blocks]);
  const { sections, language } = useMemo(
    () => readPreferenceSections(blocks),
    [blocks]
  );
  const versions = useQuery(trpc.profile.versions.queryOptions({ kind }));
  const latest = versions.data?.[0] ?? draft.publishedVersion;
  const published = useQuery({
    ...trpc.profile.version.queryOptions({
      profileVersionId: latest?.id ?? "",
      kind,
    }),
    enabled: !!latest,
  });
  const publish = useMutation(trpc.profile.publish.mutationOptions());
  const changed = published.data?.markdown !== serializeBlocks(blocks);
  const blocked = hasFormatErrors(findings);

  // The findings drawn over the text follow every lint.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const { doc } = editor.state;
    const positions = blockPositions(doc);
    if (positions.length !== blocks.length) return;
    const specs: EditorDecorationSpec[] = findings.flatMap((finding, index) =>
      finding.line === null
        ? []
        : [
            {
              kind: "inline" as const,
              from: positions[finding.line] + 1 + finding.from,
              to:
                positions[finding.line] +
                1 +
                Math.max(finding.to, finding.from + 1),
              className: `profile-finding profile-finding-${finding.kind}`,
              finding: `finding-${index}`,
              key: `finding-${index}`,
            },
          ]
    );
    setDecorations(editor, specs);
    // findingMessage changes with the interface language only.
  }, [editor, blocks, findings, language]);

  /** Replaces the document's text, as one undo step. */
  function apply(next: ProfileBlock[]) {
    if (!editor) return;
    editor.chain().setContent(blocksToDoc(next), { emitUpdate: true }).run();
  }

  async function saveNow() {
    if (editor) {
      clearTimeout(lintTimer.current);
      const next = docToBlocks(editor.state.doc);
      setBlocks(next);
      autosave.change(serializeBlocks(next));
    }
    return autosave.saveNow();
  }

  const markdown = () =>
    serializeBlocks(editor ? docToBlocks(editor.state.doc) : blocks);

  async function publishDraft() {
    const revision = await saveNow();
    if (revision === null) {
      toast.error(
        t.formatMessage({
          defaultMessage: "Save the preferences before publishing.",
        })
      );
      return;
    }
    try {
      const result = await publish.mutateAsync({
        baseRevision: revision,
        kind,
      });
      toast.success(
        t.formatMessage(
          {
            defaultMessage:
              "Version {number, number} published: the next fit checks read it.",
          },
          { number: result.number }
        )
      );
      await queryClient.invalidateQueries({ queryKey: trpc.profile.pathKey() });
    } catch {
      toast.error(
        t.formatMessage({
          defaultMessage: "The preferences couldn't be published.",
        })
      );
    }
  }

  function download() {
    const file = new Blob([markdown()], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "job_preferences.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  const addable: Record<AddableSection, string> = {
    excludedCompanies: t.formatMessage({ defaultMessage: "Excluded company" }),
    excludedSectors: t.formatMessage({ defaultMessage: "Excluded sector" }),
    locations: t.formatMessage({ defaultMessage: "Accepted location" }),
    discardRules: t.formatMessage({ defaultMessage: "Discard rule" }),
  };

  function add() {
    if (!adding || !addText.trim() || !editor) return;
    const current = docToBlocks(editor.state.doc);
    apply(
      addPreference(
        current,
        adding === "excludedCompanies"
          ? {
              section: adding,
              company: addText,
              date: new Date().toLocaleDateString("sv-SE"),
            }
          : { section: adding, text: addText }
      )
    );
    setAdding(null);
    setAddText("");
  }

  const status = {
    saved: t.formatMessage({ defaultMessage: "Saved" }),
    pending: t.formatMessage({ defaultMessage: "Editing…" }),
    saving: t.formatMessage({ defaultMessage: "Saving…" }),
    error: t.formatMessage({
      defaultMessage: "Not saved: check your connection",
    }),
    conflict: t.formatMessage({
      defaultMessage: "Changed in another tab: reload to keep editing",
    }),
  }[autosave.status];

  return (
    <div className="flex min-h-0 flex-1">
      <ResizableAside
        storageKey="profile-index-width"
        className="space-y-6 p-4"
      >
        <DocumentSwitch current={kind} />
        <nav>
          <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
            {t.formatMessage({ defaultMessage: "Index" })}
          </p>
          <ul className="space-y-0.5 text-sm">
            {sections.map((section) => (
              <li key={section.heading}>
                <button
                  type="button"
                  className={cn(
                    "hover:bg-muted w-full truncate rounded px-2 py-1 text-left",
                    !section.key && "text-muted-foreground italic"
                  )}
                  onClick={() => {
                    if (!editor) return;
                    const position = blockPositions(editor.state.doc)[
                      section.heading
                    ];
                    if (position !== undefined) focusNodeEnd(editor, position);
                  }}
                >
                  {blocks[section.heading]?.text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <section>
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs font-medium uppercase">
              {t.formatMessage(
                { defaultMessage: "Findings ({count, number})" },
                { count: findings.length }
              )}
            </p>
            {findings.some((finding) => finding.fixable) && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() =>
                  editor &&
                  apply(fixPreferencesFormat(docToBlocks(editor.state.doc)))
                }
              >
                <Wand2 className="size-3" />
                {t.formatMessage({ defaultMessage: "Fix format" })}
              </Button>
            )}
          </div>
          <ul className="space-y-0.5">
            {findings.map((finding, index) => (
              <li
                key={`${finding.code}-${index}`}
                className={cn(
                  "px-2 py-1 text-xs",
                  finding.kind === "format"
                    ? "text-destructive"
                    : "text-muted-foreground"
                )}
              >
                {findingMessage(finding, language)}
              </li>
            ))}
          </ul>
        </section>
      </ResizableAside>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="bg-background/95 sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b px-4 py-2 backdrop-blur">
          <span
            className={
              autosave.status === "error" || autosave.status === "conflict"
                ? "text-destructive text-xs"
                : "text-muted-foreground text-xs"
            }
            aria-live="polite"
          >
            {status}
          </span>
          <span className="text-muted-foreground text-xs">{dot}</span>
          <span className="text-muted-foreground text-xs">
            {latest
              ? changed
                ? t.formatMessage(
                    {
                      defaultMessage:
                        "Version {number, number} published; the draft has changes",
                    },
                    { number: latest.number }
                  )
                : t.formatMessage(
                    { defaultMessage: "Version {number, number} published" },
                    { number: latest.number }
                  )
              : t.formatMessage({ defaultMessage: "Not published yet" })}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Plus className="size-4" />
                  {t.formatMessage({ defaultMessage: "Add" })}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(Object.keys(addable) as AddableSection[]).map((section) => (
                  <DropdownMenuItem
                    key={section}
                    onSelect={() => setAdding(section)}
                  >
                    {addable[section]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" onClick={download}>
              <Download className="size-4" />
              {t.formatMessage({ defaultMessage: "Download" })}
            </Button>
            {!!versions.data?.length && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVersionsOpen(true)}
              >
                <History className="size-4" />
                {t.formatMessage({ defaultMessage: "Versions" })}
              </Button>
            )}
            <Button
              size="sm"
              disabled={
                blocked ||
                !changed ||
                publish.isPending ||
                autosave.status === "conflict"
              }
              title={
                blocked
                  ? t.formatMessage({
                      defaultMessage:
                        "Fix the format findings first: screening reads these sections by name.",
                    })
                  : t.formatMessage({
                      defaultMessage:
                        "Makes this draft what the fit checks read.",
                    })
              }
              onClick={() => void publishDraft()}
            >
              {publish.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {t.formatMessage({ defaultMessage: "Publish" })}
            </Button>
          </div>
        </div>
        {adding && (
          <form
            className="bg-muted/40 flex items-center gap-2 border-b px-4 py-2"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <span className="text-xs font-medium">{addable[adding]}</span>
            <Input
              autoFocus
              value={addText}
              onChange={(event) => setAddText(event.target.value)}
              className="h-8 max-w-sm"
            />
            <Button type="submit" size="sm" disabled={!addText.trim()}>
              {t.formatMessage({ defaultMessage: "Add" })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setAdding(null)}
            >
              {t.formatMessage({ defaultMessage: "Cancel" })}
            </Button>
          </form>
        )}
        <div className="mx-auto w-full max-w-3xl px-8 py-8">
          <p className="text-muted-foreground mb-4 text-xs">
            {t.formatMessage({
              defaultMessage:
                "Only the fit check of openings reads this document, from its published version. Nothing here ever reaches a resume or a cover letter.",
            })}
          </p>
          <EditorContent editor={editor} />
          <LinkHoverCard editor={editor} />
          <FindingHoverCard
            editor={editor}
            describe={(key) => {
              const finding = findings[Number(key.split("-")[1])];
              if (!finding || !editor) return null;
              return {
                message: findingMessage(finding, language),
                fix: finding.fixable
                  ? () =>
                      apply(fixPreferencesFormat(docToBlocks(editor.state.doc)))
                  : undefined,
              };
            }}
          />
        </div>
      </div>
      <VersionsDialog
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        kind={kind}
        markdown={markdown}
        saveNow={saveNow}
        resetTo={(next) => {
          autosave.reset(next);
          const restored = parseBlocks(next.markdown);
          editor?.commands.setContent(blocksToDoc(restored), {
            emitUpdate: false,
          });
          setBlocks(restored);
        }}
      />
    </div>
  );
}
