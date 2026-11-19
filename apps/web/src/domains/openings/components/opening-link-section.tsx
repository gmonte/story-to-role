"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";

import type { OpeningDetail } from "@repo/api/domains/openings/schemas/opening-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Input } from "@repo/web/components/ui/input";
import { toast } from "@repo/web/components/ui/sonner";

import {
  EditActions,
  Empty,
  GearButton,
  Section,
} from "~/domains/applications/components/application-section";
import { useTRPC } from "~/tools/trpc/client";

import { useRefreshOpenings } from "../hooks/use-opening";

/**
 * The posting's link, a section of the application column: the one the
 * opening was read from, or one the user adds, changes or clears.
 */
export function OpeningLinkSection({
  openingId,
  opening,
}: {
  openingId: string;
  opening: OpeningDetail;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshOpenings();
  const [editing, setEditing] = useState(false);
  const [link, setLink] = useState("");
  const save = useMutation(
    trpc.openings.rename.mutationOptions({
      onSuccess: async () => {
        await refresh();
        setEditing(false);
      },
      onError: (error) => toast.error(error.message),
    })
  );
  const label = t.formatMessage({ defaultMessage: "Link to the posting" });

  return (
    <Section
      label={label}
      action={
        !editing && (
          <GearButton
            label={t.formatMessage({ defaultMessage: "Edit the link" })}
            onClick={() => {
              setLink(opening.sourceUrl ?? "");
              setEditing(true);
            }}
          />
        )
      }
    >
      {editing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate({
              openingId,
              // The title stays as it is; only the link changes.
              title: opening.title ?? "",
              sourceUrl: link.trim() || null,
            });
          }}
        >
          <Input
            autoFocus
            type="url"
            value={link}
            maxLength={2000}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://"
            aria-label={label}
            className="h-8 text-sm"
          />
          <EditActions
            pending={save.isPending}
            onCancel={() => setEditing(false)}
          />
        </form>
      ) : opening.sourceUrl ? (
        <a
          href={opening.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="hover:text-foreground inline-flex min-w-0 items-center gap-1 text-sm underline-offset-4 hover:underline"
        >
          <ExternalLink className="size-3.5 shrink-0" />
          <span className="truncate">{hostOf(opening.sourceUrl)}</span>
        </a>
      ) : (
        <Empty>{t.formatMessage({ defaultMessage: "None yet" })}</Empty>
      )}
    </Section>
  );
}

/** “jobs.example.com” for a link, or the link when it can't be read. */
function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
