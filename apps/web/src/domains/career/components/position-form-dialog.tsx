"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { useMutation } from "@tanstack/react-query";

import type { PositionView } from "@repo/api/domains/career/schemas/timeline";
import { useTranslation } from "@repo/intl/use-translation";
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
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshCareer } from "../hooks/use-career-queries";

/** Adds a position by hand, or edits one (the user owns every fact). */
export function PositionFormDialog({
  position,
  trigger,
}: {
  position?: PositionView;
  trigger: ReactNode;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshCareer();
  const [open, setOpen] = useState(false);

  const onSuccess = async () => {
    await refresh();
    setOpen(false);
  };
  const onError = (error: { message: string }) => toast.error(error.message);
  const add = useMutation(
    trpc.career.addPosition.mutationOptions({ onSuccess, onError })
  );
  const update = useMutation(
    trpc.career.updatePosition.mutationOptions({ onSuccess, onError })
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
    const input = {
      employer: value("employer") ?? "",
      title: value("title") ?? "",
      location: value("location"),
      startDate: value("startDate"),
      endDate: value("endDate"),
    };
    if (position) update.mutate({ positionId: position.id, ...input });
    else add.mutate(input);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {position
              ? t.formatMessage({ defaultMessage: "Edit position" })
              : t.formatMessage({ defaultMessage: "Add position" })}
          </DialogTitle>
        </DialogHeader>
        <form id="position-form" onSubmit={onSubmit} className="grid gap-3">
          <Field
            name="employer"
            label={t.formatMessage({ defaultMessage: "Employer" })}
            defaultValue={position?.employer}
            required
          />
          <Field
            name="title"
            label={t.formatMessage({ defaultMessage: "Title" })}
            defaultValue={position?.title}
            required
          />
          <Field
            name="location"
            label={t.formatMessage({ defaultMessage: "Location" })}
            defaultValue={position?.location ?? undefined}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              name="startDate"
              type="month"
              label={t.formatMessage({ defaultMessage: "Start" })}
              defaultValue={position?.startDate ?? undefined}
            />
            <Field
              name="endDate"
              type="month"
              label={t.formatMessage({
                defaultMessage: "End (empty if current)",
              })}
              defaultValue={position?.endDate ?? undefined}
            />
          </div>
        </form>
        <DialogFooter>
          <Button
            form="position-form"
            type="submit"
            disabled={add.isPending || update.isPending}
          >
            {t.formatMessage({ defaultMessage: "Save" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  name,
  label,
  ...props
}: { name: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  );
}
