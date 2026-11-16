import { z } from "zod";

import { db } from "@repo/api/tools/db";
import { ok, okSchema, openApiMeta } from "@repo/api/tools/openapi";
import { createTRPCRouter, userProcedure } from "@repo/api/tools/trpc";

import { applicationStatusSchema } from "../schemas/application";
import {
  applicationDetailSchema,
  reminderSchema,
  trackedApplicationSchema,
  trackerSettingsSchema,
} from "../schemas/tracker";
import { TrackerService } from "./tracker-service";

const applicationInput = z.object({ applicationId: z.uuid() });

export const trackerRouter = createTRPCRouter({
  list: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "GET",
        "/applications",
        "Lists the user's applications"
      )
    )
    .input(z.object({}))
    .output(z.array(trackedApplicationSchema))
    .query(({ ctx }) => new TrackerService(db).list(ctx.userId)),

  get: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "GET",
        "/applications/by-id/{applicationId}",
        "Returns an application with its timeline and what was sent"
      )
    )
    .input(applicationInput)
    .output(applicationDetailSchema)
    .query(({ ctx, input }) =>
      new TrackerService(db).get({ userId: ctx.userId, ...input })
    ),

  setStatus: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "POST",
        "/applications/by-id/{applicationId}/status",
        "Moves an application to another status"
      )
    )
    .input(
      applicationInput.extend({
        status: applicationStatusSchema,
        note: z.string().max(2000).optional(),
      })
    )
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new TrackerService(db).setStatus({ userId: ctx.userId, ...input });
      return ok;
    }),

  markApplied: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "POST",
        "/applications/by-id/{applicationId}/applied",
        "Marks an application as sent, recording the snapshot of each version"
      )
    )
    .input(
      applicationInput.extend({
        versionIds: z.array(z.uuid()).min(1).max(10),
        appliedAt: z.coerce.date().optional(),
      })
    )
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new TrackerService(db).markApplied({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  addEvent: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "POST",
        "/applications/by-id/{applicationId}/events",
        "Adds a dated event to an application's timeline"
      )
    )
    .input(
      applicationInput.extend({
        occurredAt: z.coerce.date(),
        text: z.string().trim().min(1).max(2000),
      })
    )
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new TrackerService(db).addEvent({ userId: ctx.userId, ...input });
      return ok;
    }),

  deleteEvent: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "DELETE",
        "/applications/by-id/{applicationId}/events/by-id/{eventId}",
        "Deletes an event from an application's timeline"
      )
    )
    .input(applicationInput.extend({ eventId: z.uuid() }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new TrackerService(db).deleteEvent({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  createExternal: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "POST",
        "/applications/external",
        "Registers an application made outside StoryToRole"
      )
    )
    .input(
      z.object({
        company: z.string().trim().min(1).max(200),
        title: z.string().trim().min(1).max(200),
        link: z.url().max(2000),
        description: z.string().max(20_000).optional(),
        status: applicationStatusSchema,
        appliedAt: z.coerce.date().optional(),
      })
    )
    .output(z.object({ applicationId: z.uuid(), openingId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      new TrackerService(db).createExternal({ userId: ctx.userId, ...input })
    ),

  reminders: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "GET",
        "/reminders",
        "Lists the user's in-app reminders"
      )
    )
    .input(z.object({}))
    .output(z.array(reminderSchema))
    .query(({ ctx }) => new TrackerService(db).reminders(ctx.userId)),

  dismissReminder: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "POST",
        "/reminders/dismiss",
        "Dismisses a reminder"
      )
    )
    .input(z.object({ reminderKey: z.string().min(1).max(200) }))
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new TrackerService(db).dismissReminder({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  settings: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "GET",
        "/tracker/settings",
        "Returns the reminder settings"
      )
    )
    .input(z.object({}))
    .output(trackerSettingsSchema)
    .query(({ ctx }) => new TrackerService(db).getSettings(ctx.userId)),

  updateSettings: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "PUT",
        "/tracker/settings",
        "Saves the reminder settings"
      )
    )
    .input(trackerSettingsSchema)
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new TrackerService(db).updateSettings({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),
});
