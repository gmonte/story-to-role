"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, History, Pencil, Plus, RotateCcw, X } from "lucide-react";

import {
  highlightAccount,
  type AccountSegment,
  type FigureOrigin,
} from "@repo/api/domains/career/accounts/account-marks";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { Input } from "@repo/web/components/ui/input";
import { toast } from "@repo/web/components/ui/sonner";
import { Textarea } from "@repo/web/components/ui/textarea";
import { cn } from "@repo/web/lib/utils";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshCareer } from "../hooks/use-career-queries";

/** The highlighter's colour for each figure origin. */
const highlight: Record<FigureOrigin | "unmarked", string> = {
  measured: "bg-emerald-500/20",
  estimated: "bg-amber-500/25",
  no_number: "bg-muted",
  to_confirm: "bg-rose-500/20",
  unmarked:
    "underline decoration-amber-500 decoration-dashed underline-offset-4",
};

/**
 * A position's account (ADR 0008): the user's own text about it, approved
 * as a whole. It shows the approved version with its figures highlighted by
 * origin, the draft to approve or discard, an editor for the text and its
 * "do not include" list, and the earlier versions to read or restore.
 */
export function AccountSection({ positionId }: { positionId: string }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = useRefreshCareer();
  const query = trpc.career.positionAccount.queryOptions({ positionId });
  const account = useQuery(query);
  const [editing, setEditing] = useState<{
    text: string;
    doNotInclude: string[];
  } | null>(null);
  const [showVersions, setShowVersions] = useState(false);

  const done = async () => {
    setEditing(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: query.queryKey }),
      refresh(),
    ]);
  };
  const onError = (error: { message: string }) => toast.error(error.message);
  const save = useMutation(
    trpc.career.saveAccountDraft.mutationOptions({ onSuccess: done, onError })
  );
  const approve = useMutation(
    trpc.career.approveAccountDraft.mutationOptions({
      onSuccess: done,
      onError,
    })
  );
  const discard = useMutation(
    trpc.career.discardAccountDraft.mutationOptions({
      onSuccess: done,
      onError,
    })
  );

  if (!account.data) return null;
  const { approved, draft, versions } = account.data;
  const current = draft ?? approved;
  const startEditing = () =>
    setEditing({
      text: current?.text ?? "",
      doNotInclude: current?.doNotInclude ?? [],
    });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium">
          {t.formatMessage({ defaultMessage: "Account" })}
        </h2>
        {approved && (
          <Badge variant="outline">
            {t.formatMessage(
              { defaultMessage: "Version {version, number}" },
              { version: approved.version }
            )}
          </Badge>
        )}
        {draft && (
          <Badge variant="secondary">
            {t.formatMessage({ defaultMessage: "Draft" })}
          </Badge>
        )}
        {!editing && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={startEditing}
          >
            <Pencil />
            {current
              ? t.formatMessage({ defaultMessage: "Edit" })
              : t.formatMessage({ defaultMessage: "Write it" })}
          </Button>
        )}
      </div>

      {editing ? (
        <AccountEditor
          value={editing}
          onChange={setEditing}
          saving={save.isPending}
          onCancel={() => setEditing(null)}
          onSave={() => save.mutate({ positionId, ...editing })}
        />
      ) : current ? (
        <div className="flex flex-col gap-2">
          <AccountText text={current.text} />
          {current.doNotInclude.length > 0 && (
            <DoNotInclude items={current.doNotInclude} />
          )}
          {draft && (
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-muted-foreground mr-auto text-xs">
                {approved
                  ? t.formatMessage({
                      defaultMessage:
                        "This draft replaces the account once approved.",
                    })
                  : t.formatMessage({
                      defaultMessage:
                        "Approve it to make it this position's account.",
                    })}
              </p>
              <Button
                size="sm"
                disabled={approve.isPending}
                onClick={() => approve.mutate({ positionId })}
              >
                <Check />
                {t.formatMessage({ defaultMessage: "Approve" })}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={discard.isPending}
                onClick={() => discard.mutate({ positionId })}
              >
                <X />
                {t.formatMessage({ defaultMessage: "Discard" })}
              </Button>
            </div>
          )}
          <MarksLegend />
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          {t.formatMessage({
            defaultMessage:
              "Tell, in your own words, what it was like to work here: what you did, the challenges, the results, and what you did not do. Mark where each number comes from: [medido], [estimado], [sem número] or [a confirmar].",
          })}
        </p>
      )}

      {versions.length > 0 && (
        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() => setShowVersions((open) => !open)}
          >
            <History />
            {t.formatMessage(
              {
                defaultMessage:
                  "{count, plural, =0 {No versions} one {# version} other {# versions}}",
              },
              { count: versions.length }
            )}
          </Button>
          {showVersions &&
            versions.map((version) => (
              <VersionRow
                key={version.accountVersionId}
                accountVersionId={version.accountVersionId}
                version={version.version}
                approvedAt={version.approvedAt}
                current={
                  version.accountVersionId === approved?.accountVersionId
                }
                onRestored={done}
              />
            ))}
        </div>
      )}
    </section>
  );
}

/** The account's text, each mark and figure highlighted by its origin. */
export function AccountText({ text }: { text: string }) {
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap">
      {highlightAccount(text).map((segment, index) => (
        <Segment key={index} segment={segment} />
      ))}
    </p>
  );
}

function Segment({ segment }: { segment: AccountSegment }) {
  if ("mark" in segment) {
    return (
      <span
        className={cn(
          "text-muted-foreground rounded px-0.5 text-xs",
          highlight[segment.mark]
        )}
      >
        {segment.text}
      </span>
    );
  }
  if ("figure" in segment) {
    return (
      <mark
        className={cn(
          "text-foreground rounded bg-transparent px-0.5",
          highlight[segment.figure]
        )}
      >
        {segment.text}
      </mark>
    );
  }
  return segment.text;
}

/** What each highlight means. */
function MarksLegend() {
  const t = useTranslation();
  const items: Array<[FigureOrigin | "unmarked", string]> = [
    ["measured", t.formatMessage({ defaultMessage: "measured" })],
    ["estimated", t.formatMessage({ defaultMessage: "estimated" })],
    ["no_number", t.formatMessage({ defaultMessage: "no number" })],
    ["to_confirm", t.formatMessage({ defaultMessage: "to confirm" })],
    ["unmarked", t.formatMessage({ defaultMessage: "origin not said" })],
  ];
  return (
    <p className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {items.map(([origin, label]) => (
        <span key={origin} className={cn("rounded px-1", highlight[origin])}>
          {label}
        </span>
      ))}
    </p>
  );
}

/** Names and figures never to appear in what is generated from the account. */
function DoNotInclude({ items }: { items: string[] }) {
  const t = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-xs">
        {t.formatMessage({ defaultMessage: "Do not include:" })}
      </span>
      {items.map((item) => (
        <Badge key={item} variant="outline">
          {item}
        </Badge>
      ))}
    </div>
  );
}

function AccountEditor({
  value,
  onChange,
  saving,
  onCancel,
  onSave,
}: {
  value: { text: string; doNotInclude: string[] };
  onChange: (value: { text: string; doNotInclude: string[] }) => void;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useTranslation();
  const [item, setItem] = useState("");
  const add = () => {
    const trimmed = item.trim();
    if (!trimmed || value.doNotInclude.includes(trimmed)) return;
    onChange({ ...value, doNotInclude: [...value.doNotInclude, trimmed] });
    setItem("");
  };
  return (
    <div className="flex flex-col gap-3">
      <Textarea
        autoFocus
        rows={12}
        value={value.text}
        onChange={(event) => onChange({ ...value, text: event.target.value })}
        placeholder={t.formatMessage({
          defaultMessage:
            "What it was like to work here, what you did, the challenges, the results, what you did not do…",
        })}
      />
      <div className="flex flex-col gap-1.5">
        <p className="text-muted-foreground text-xs">
          {t.formatMessage({
            defaultMessage:
              "Do not include: names, clients, codenames or figures that must never appear in what is written from this account.",
          })}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {value.doNotInclude.map((entry) => (
            <Badge key={entry} variant="outline" className="gap-1">
              {entry}
              <button
                type="button"
                aria-label={t.formatMessage(
                  { defaultMessage: "Remove {item}" },
                  { item: entry }
                )}
                onClick={() =>
                  onChange({
                    ...value,
                    doNotInclude: value.doNotInclude.filter(
                      (candidate) => candidate !== entry
                    ),
                  })
                }
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Input
            value={item}
            onChange={(event) => setItem(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            placeholder={t.formatMessage({ defaultMessage: "Banco X" })}
          />
          <Button type="button" size="sm" variant="outline" onClick={add}>
            <Plus />
            {t.formatMessage({ defaultMessage: "Add" })}
          </Button>
        </div>
      </div>
      <div className="flex gap-1.5">
        <Button
          size="sm"
          disabled={!value.text.trim() || saving}
          onClick={onSave}
        >
          <Check />
          {t.formatMessage({ defaultMessage: "Save draft" })}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t.formatMessage({ defaultMessage: "Cancel" })}
        </Button>
      </div>
    </div>
  );
}

/** One earlier version: read it, or bring it back as the draft. */
function VersionRow({
  accountVersionId,
  version,
  approvedAt,
  current,
  onRestored,
}: {
  accountVersionId: string;
  version: number;
  approvedAt: Date;
  current: boolean;
  onRestored: () => Promise<void>;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const detail = useQuery({
    ...trpc.career.accountVersion.queryOptions({ accountVersionId }),
    enabled: open,
  });
  const restore = useMutation(
    trpc.career.restoreAccountVersion.mutationOptions({
      onSuccess: onRestored,
      onError: (error) => toast.error(error.message),
    })
  );
  return (
    <div className="rounded-lg border p-2">
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          className="hover:underline"
          onClick={() => setOpen((value) => !value)}
        >
          {t.formatMessage(
            { defaultMessage: "Version {version, number} · {date}" },
            {
              version,
              date: t.formatDate(approvedAt, {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }),
            }
          )}
        </button>
        {current ? (
          <Badge variant="outline" className="ml-auto">
            {t.formatMessage({ defaultMessage: "Current" })}
          </Badge>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7"
            disabled={restore.isPending}
            onClick={() => restore.mutate({ accountVersionId })}
          >
            <RotateCcw />
            {t.formatMessage({ defaultMessage: "Restore" })}
          </Button>
        )}
      </div>
      {open && detail.data && (
        <div className="pt-2">
          <AccountText text={detail.data.text} />
        </div>
      )}
    </div>
  );
}
