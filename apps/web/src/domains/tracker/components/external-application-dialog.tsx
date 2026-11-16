"use client";

import { useState, type ReactNode } from "react";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import type { ApplicationStatus } from "@repo/api/domains/applications/schemas/application";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from "@repo/web/components/ui/textarea";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshTracker } from "../hooks/use-tracker";
import { useTrackerLabels } from "../hooks/use-tracker-labels";

const today = () => new Date().toLocaleDateString("en-CA");
const statuses: ApplicationStatus[] = [
  "applied",
  "in_process",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
];

/**
 * An application made outside StoryToRole (tracker spec): company, title,
 * link and optionally the description; no documents and no credits spent.
 */
export function ExternalApplicationDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {/* Mounted per opening: the form starts empty each time. */}
        <ExternalApplicationForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ExternalApplicationForm({ onDone }: { onDone: () => void }) {
  const t = useTranslation();
  const labels = useTrackerLabels();
  const trpc = useTRPC();
  const router = useRouter();
  const refresh = useRefreshTracker();
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ApplicationStatus>("applied");
  const [date, setDate] = useState(today());
  const create = useMutation(
    trpc.tracker.createExternal.mutationOptions({
      onSuccess: async ({ openingId }) => {
        await refresh();
        onDone();
        router.push(`/app/openings/${openingId}`);
      },
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate({
          company,
          title,
          link: link.trim() ? link.trim() : undefined,
          description: description.trim() ? description : undefined,
          status,
          appliedAt:
            date === today() ? new Date() : new Date(`${date}T12:00:00`),
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {t.formatMessage({
            defaultMessage: "Add an application made elsewhere",
          })}
        </DialogTitle>
        <DialogDescription>
          {t.formatMessage({
            defaultMessage:
              "For openings you applied to outside StoryToRole. Nothing is analyzed and no credits are spent.",
          })}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="external-company">
            {t.formatMessage({ defaultMessage: "Company" })}
          </Label>
          <Input
            id="external-company"
            required
            maxLength={200}
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="external-title">
            {t.formatMessage({ defaultMessage: "Title" })}
          </Label>
          <Input
            id="external-title"
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="external-link">
          {t.formatMessage({ defaultMessage: "Link (optional)" })}
        </Label>
        <Input
          id="external-link"
          type="url"
          value={link}
          onChange={(event) => setLink(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="external-description">
          {t.formatMessage({ defaultMessage: "Description (optional)" })}
        </Label>
        <Textarea
          id="external-description"
          rows={4}
          maxLength={20_000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>{t.formatMessage({ defaultMessage: "Status" })}</Label>
          <Select
            value={status}
            onValueChange={(value) => setStatus(value as ApplicationStatus)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((option) => (
                <SelectItem key={option} value={option}>
                  {labels.status(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="external-date">
            {t.formatMessage({ defaultMessage: "Applied on" })}
          </Label>
          <Input
            id="external-date"
            type="date"
            max={today()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={create.isPending}>
          {t.formatMessage({ defaultMessage: "Add" })}
        </Button>
      </DialogFooter>
    </form>
  );
}
