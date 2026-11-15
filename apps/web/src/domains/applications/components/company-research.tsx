"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Globe, Loader2 } from "lucide-react";

import type { CompanyFactView } from "@repo/api/domains/applications/schemas/research";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

/**
 * Company research (resume spec, "Cover letter inputs"): on request, a
 * task searches the web and returns facts with their sources; only the
 * facts the user selects enter a cover letter.
 */
export function CompanyResearch({
  openingId,
  hasCompany,
}: {
  openingId: string;
  hasCompany: boolean;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const research = useQuery({
    ...trpc.research.get.queryOptions({ openingId }),
    refetchInterval: (query) =>
      query.state.data?.status === "researching" ? 2500 : false,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trpc.research.pathKey() });
  const start = useMutation(
    trpc.research.start.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );
  const data = research.data;
  if (!data) return null;
  const researching = data.status === "researching";

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          {t.formatMessage({ defaultMessage: "Company research" })}
        </h3>
        <Button
          size="sm"
          variant="ghost"
          disabled={!hasCompany || researching || start.isPending}
          onClick={() => start.mutate({ openingId })}
        >
          {researching ? <Loader2 className="animate-spin" /> : <Globe />}
          {data.status
            ? t.formatMessage({ defaultMessage: "Research again" })
            : t.formatMessage({ defaultMessage: "Research company" })}
        </Button>
      </div>
      {!hasCompany && (
        <p className="text-muted-foreground text-xs">
          {t.formatMessage({
            defaultMessage: "Add the company to the opening to research it.",
          })}
        </p>
      )}
      {researching && (
        <p className="text-muted-foreground text-xs">
          {t.formatMessage({
            defaultMessage: "Searching the web for facts about the company…",
          })}
        </p>
      )}
      {data.status === "failed" && (
        <p className="text-xs text-red-600">
          {t.formatMessage({
            defaultMessage: "The research didn't finish. Try again.",
          })}
        </p>
      )}
      {data.facts.length > 0 && (
        <FactSelection
          key={data.facts.map((fact) => `${fact.id}:${fact.approved}`).join()}
          openingId={openingId}
          facts={data.facts}
          onSaved={refresh}
        />
      )}
      {data.status === "done" && data.facts.length === 0 && (
        <p className="text-muted-foreground text-xs">
          {t.formatMessage({
            defaultMessage: "No facts with a source were found.",
          })}
        </p>
      )}
    </section>
  );
}

function FactSelection({
  openingId,
  facts,
  onSaved,
}: {
  openingId: string;
  facts: CompanyFactView[];
  onSaved: () => Promise<void>;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const [selected, setSelected] = useState(
    facts.filter((fact) => fact.approved).map((fact) => fact.id)
  );
  const save = useMutation(
    trpc.research.selectFacts.mutationOptions({
      onSuccess: onSaved,
      onError: (error) => toast.error(error.message),
    })
  );
  const approved = facts.filter((fact) => fact.approved).map((fact) => fact.id);
  const changed =
    selected.length !== approved.length ||
    selected.some((id) => !approved.includes(id));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">
        {t.formatMessage({
          defaultMessage:
            "Facts from third-party pages. Only the ones you select enter the cover letter.",
        })}
      </p>
      <ul className="flex flex-col gap-1.5">
        {facts.map((fact) => (
          <li
            key={fact.id}
            className="bg-background flex items-start gap-2 rounded-md border p-2 text-xs"
          >
            <Checkbox
              className="mt-0.5"
              checked={selected.includes(fact.id)}
              onCheckedChange={(checked) =>
                setSelected(
                  checked
                    ? [...selected, fact.id]
                    : selected.filter((id) => id !== fact.id)
                )
              }
            />
            <span className="flex flex-col gap-0.5">
              <span>{fact.text}</span>
              <a
                // Only http(s) reaches here: the API validates the scheme.
                href={fact.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline"
              >
                <ExternalLink className="size-3" />
                {fact.sourceTitle}
              </a>
            </span>
          </li>
        ))}
      </ul>
      {changed && (
        <Button
          size="sm"
          className="self-end"
          disabled={save.isPending}
          onClick={() => save.mutate({ openingId, companyFactIds: selected })}
        >
          {t.formatMessage({ defaultMessage: "Use selected facts" })}
        </Button>
      )}
    </div>
  );
}
