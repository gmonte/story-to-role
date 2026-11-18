"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";

import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
import { Input } from "@repo/web/components/ui/input";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useDocumentLabels } from "../hooks/use-document-labels";
import { useRefreshDocuments } from "../hooks/use-opening-documents";

/**
 * Titles proposed by the first adaptation into a language (resume spec,
 * "Adaptations"): the user approves or edits each once, and it becomes a
 * locked fact of the position in that language.
 */
export function TitleProposals({ version }: { version: VersionView }) {
  return version.titleProposals.map((proposal) => (
    <TitleProposal
      key={`${proposal.positionId}:${proposal.proposed}`}
      version={version}
      proposal={proposal}
    />
  ));
}

function TitleProposal({
  version,
  proposal,
}: {
  version: VersionView;
  proposal: VersionView["titleProposals"][number];
}) {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const [title, setTitle] = useState(proposal.proposed);
  const [addToProfile, setAddToProfile] = useState(false);
  const approve = useMutation(
    trpc.adaptation.approveTitle.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 p-2.5 text-xs">
      <span>
        {t.formatMessage(
          { defaultMessage: "“{current}” in {language}:" },
          {
            current: proposal.current,
            language: labels.language(version.language),
          }
        )}
      </span>
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={200}
        className="h-7 w-64 text-xs"
      />
      <Button
        size="sm"
        disabled={approve.isPending || !title.trim()}
        onClick={() =>
          approve.mutate({
            versionId: version.id,
            positionId: proposal.positionId,
            title,
            addToProfile,
          })
        }
      >
        {t.formatMessage({ defaultMessage: "Approve title" })}
      </Button>
      <label className="flex items-center gap-1.5">
        <Checkbox
          checked={addToProfile}
          onCheckedChange={(checked) => setAddToProfile(checked === true)}
        />
        {t.formatMessage({
          defaultMessage: "Also save it in my profile's translations",
        })}
      </label>
    </div>
  );
}
