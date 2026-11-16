"use client";

import { useState, type FormEvent } from "react";

import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import type { CredentialKind } from "@repo/api/domains/career/schemas/career";
import type { CredentialView } from "@repo/api/domains/career/schemas/timeline";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/web/components/ui/dialog";
import { Input } from "@repo/web/components/ui/input";
import { Label } from "@repo/web/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/web/components/ui/select";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useCareerLabels } from "../hooks/use-career-labels";
import { useRefreshCareer } from "../hooks/use-career-queries";
import { useCareerWorkspace } from "./career-workspace-context";

/** The credential kinds each group of the side panel shows, as the resume does. */
const groupKinds = {
  education: ["education"],
  language: ["language"],
  certification: ["certification"],
  other: ["course", "publication", "award", "volunteering"],
} as const satisfies Record<string, readonly CredentialKind[]>;

/**
 * Education, languages, certifications and the rest: short facts approved
 * item by item, each of which can also tell its story in a short session.
 */
export function CredentialsSection({
  credentials,
}: {
  credentials: CredentialView[];
}) {
  const t = useTranslation();

  const groups = [
    {
      kinds: groupKinds.education,
      title: t.formatMessage({ defaultMessage: "Education" }),
      empty: t.formatMessage({
        defaultMessage: "Degrees and schooling appear here.",
      }),
      // The kinds without a group of their own are added from here.
      addable: [...groupKinds.education, ...groupKinds.other],
    },
    {
      kinds: groupKinds.language,
      title: t.formatMessage({ defaultMessage: "Languages" }),
      empty: t.formatMessage({
        defaultMessage: "The languages you speak, with their level.",
      }),
      addable: groupKinds.language,
    },
    {
      kinds: groupKinds.certification,
      title: t.formatMessage({ defaultMessage: "Certifications" }),
      empty: t.formatMessage({
        defaultMessage: "Certifications you hold appear here.",
      }),
      addable: groupKinds.certification,
    },
    {
      kinds: groupKinds.other,
      title: t.formatMessage({
        defaultMessage: "Courses, publications and more",
      }),
      // Shown only once it has an item.
      empty: null,
      addable: groupKinds.other,
    },
  ];

  return groups.map((group) => {
    const items = credentials.filter((credential) =>
      (group.kinds as readonly CredentialKind[]).includes(credential.kind)
    );
    if (items.length === 0 && !group.empty) return null;

    return (
      <section key={group.kinds[0]} className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">{group.title}</h3>
          <AddCredentialDialog kinds={group.addable} />
        </div>
        {items.length === 0 && (
          <p className="text-muted-foreground text-xs">{group.empty}</p>
        )}
        {items.map((credential) => (
          <CredentialCard key={credential.id} credential={credential} />
        ))}
      </section>
    );
  });
}

function CredentialCard({ credential }: { credential: CredentialView }) {
  const t = useTranslation();
  const labels = useCareerLabels();
  const trpc = useTRPC();
  const refresh = useRefreshCareer();
  const { setActiveSessionId } = useCareerWorkspace();
  const onError = (error: { message: string }) => toast.error(error.message);

  const approve = useMutation(
    trpc.career.approveCredential.mutationOptions({
      onSuccess: refresh,
      onError,
    })
  );
  const remove = useMutation(
    trpc.career.removeCredential.mutationOptions({
      onSuccess: refresh,
      onError,
    })
  );
  const tellStory = useMutation(
    trpc.interview.openSession.mutationOptions({
      onSuccess: async ({ sessionId }) => {
        await refresh();
        setActiveSessionId(sessionId);
      },
      onError,
    })
  );

  return (
    <div className="bg-background flex flex-col gap-1.5 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {[credential.title, credential.level].filter(Boolean).join(" · ")}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {[labels.credentialKind(credential.kind), credential.institution]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {credential.depth.counts.stories > 0 && credential.depth.level && (
            <Badge variant="secondary">
              {labels.depth(credential.depth.level)}
            </Badge>
          )}
          {!credential.approved && (
            <Badge variant="outline">
              {t.formatMessage({ defaultMessage: "To review" })}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {!credential.approved && (
          <Button
            size="sm"
            className="h-7"
            onClick={() => approve.mutate({ credentialId: credential.id })}
          >
            {t.formatMessage({ defaultMessage: "Approve" })}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          onClick={() => tellStory.mutate({ credentialId: credential.id })}
        >
          {t.formatMessage({ defaultMessage: "Tell the story" })}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7"
          onClick={() => remove.mutate({ credentialId: credential.id })}
        >
          {t.formatMessage({ defaultMessage: "Remove" })}
        </Button>
      </div>
    </div>
  );
}

/** Adds a credential of one of `kinds`; a single kind skips the choice. */
function AddCredentialDialog({ kinds }: { kinds: readonly CredentialKind[] }) {
  const t = useTranslation();
  const labels = useCareerLabels();
  const trpc = useTRPC();
  const refresh = useRefreshCareer();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CredentialKind>(kinds[0]);
  const add = useMutation(
    trpc.career.addCredential.mutationOptions({
      onSuccess: async () => {
        await refresh();
        setOpen(false);
      },
      onError: (error) => toast.error(error.message),
    })
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => {
      const field = form.get(name);
      return typeof field === "string" && field.trim()
        ? field.trim()
        : undefined;
    };
    add.mutate({
      kind,
      title: value("title") ?? "",
      institution: value("institution"),
      level: value("level"),
      startDate: value("startDate"),
      endDate: value("endDate"),
      status: "completed",
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Plus />
          {t.formatMessage({ defaultMessage: "Add" })}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t.formatMessage({ defaultMessage: "Add credential" })}
          </DialogTitle>
        </DialogHeader>
        <form id="credential-form" onSubmit={onSubmit} className="grid gap-3">
          {kinds.length > 1 && (
            <Select
              value={kind}
              onValueChange={(value) => setKind(value as CredentialKind)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kinds.map((option) => (
                  <SelectItem key={option} value={option}>
                    {labels.credentialKind(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {[
            {
              name: "title",
              label: t.formatMessage({ defaultMessage: "Title" }),
              required: true,
            },
            {
              name: "institution",
              label: t.formatMessage({ defaultMessage: "Institution" }),
            },
            ...(kind === "language"
              ? [
                  {
                    name: "level",
                    label: t.formatMessage({ defaultMessage: "Level" }),
                  },
                ]
              : []),
          ].map((field) => (
            <div key={field.name} className="grid gap-1.5">
              <Label htmlFor={field.name}>{field.label}</Label>
              <Input
                id={field.name}
                name={field.name}
                required={field.required}
              />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="startDate">
                {t.formatMessage({ defaultMessage: "Start" })}
              </Label>
              <Input id="startDate" name="startDate" type="month" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="endDate">
                {t.formatMessage({ defaultMessage: "End" })}
              </Label>
              <Input id="endDate" name="endDate" type="month" />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button form="credential-form" type="submit" disabled={add.isPending}>
            {t.formatMessage({ defaultMessage: "Save" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
