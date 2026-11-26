import { z } from "zod";

import { db } from "@repo/api/tools/db";
import { ok, okSchema, openApiMeta } from "@repo/api/tools/openapi";
import { createTRPCRouter, userProcedure } from "@repo/api/tools/trpc";
import { templateLanguage } from "@repo/api/domains/profile/template-language";
import {
  createPaginationOutputSchema,
  paginationParamsSchema,
} from "@repo/api/utils/schemas/pagination";

import {
  applicationSourceSchema,
  applicationStatusSchema,
} from "../schemas/application";
import {
  applicationDetailSchema,
  boardFilterSchema,
  boardOpeningSchema,
  boardSortSchema,
  boardStatusSchema,
  calendarMarkerSchema,
  calendarShowSchema,
  metricsPeriodSchema,
  reminderSchema,
  resumeVersionRefSchema,
  trackedApplicationSchema,
  trackerMetricsSchema,
  trackerSettingsSchema,
} from "../schemas/tracker";
import { TrackerService } from "./tracker-service";

const applicationInput = z.object({ applicationId: z.uuid() });

/** An IANA time zone this runtime knows. */
function isTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

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

  board: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "GET",
        "/openings/board",
        "Returns a page of the Openings page: every analyzed opening, filtered and sorted, or one kanban column"
      )
    )
    .input(
      paginationParamsSchema.extend(boardFilterSchema.shape).extend({
        sort: boardSortSchema.default("activity"),
        // One kanban column.
        column: boardStatusSchema.optional(),
      })
    )
    .output(createPaginationOutputSchema({ dataSchema: boardOpeningSchema }))
    .query(({ ctx, input }) => {
      const {
        cursor,
        limit,
        sort,
        column,
        direction: _direction,
        ...filter
      } = input;
      return new TrackerService(db).board({
        userId: ctx.userId,
        filter,
        sort,
        column,
        cursor,
        limit,
      });
    }),

  calendar: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "GET",
        "/openings/calendar",
        "Returns the milestones of the openings the filter matches in a span of days (a month's weeks), per opening and day in the viewer's time zone"
      )
    )
    .input(
      boardFilterSchema.extend({
        from: z.iso.date(),
        to: z.iso.date(),
        timeZone: z.string().refine(isTimeZone, "Unknown time zone"),
        show: calendarShowSchema.default("latest"),
      })
    )
    .output(z.array(calendarMarkerSchema))
    .query(({ ctx, input }) => {
      const { from, to, timeZone, show, ...filter } = input;
      return new TrackerService(db).calendar({
        userId: ctx.userId,
        filter,
        from,
        to,
        timeZone,
        show,
      });
    }),

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

  ensureForOpening: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "POST",
        "/openings/by-id/{openingId}/application",
        "Returns the opening's application, creating it if there is none yet"
      )
    )
    .input(z.object({ openingId: z.uuid() }))
    .output(z.object({ applicationId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      new TrackerService(db).ensureForOpening({ userId: ctx.userId, ...input })
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
        // None is allowed: sent without a resume or letter from StoryToRole.
        versionIds: z.array(z.uuid()).max(10),
        appliedAt: z.coerce.date().optional(),
        acknowledgeWarnings: z.boolean().optional(),
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

  updateDetails: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "PUT",
        "/applications/by-id/{applicationId}/details",
        "Saves the method's fields of an application (omitted fields stay, null clears)"
      )
    )
    .input(
      applicationInput.extend({
        source: applicationSourceSchema.nullable().optional(),
        sourceDetail: z.string().max(200).nullable().optional(),
        // The resume version an external application was sent with.
        resumeVersionId: z.uuid().nullable().optional(),
        nextStep: z.string().max(2000).nullable().optional(),
        notes: z.string().max(10_000).nullable().optional(),
        declineReason: z.string().max(2000).nullable().optional(),
      })
    )
    .output(okSchema)
    .mutation(async ({ ctx, input }) => {
      await new TrackerService(db).updateDetails({
        userId: ctx.userId,
        ...input,
      });
      return ok;
    }),

  resumeVersions: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "GET",
        "/applications/resume-versions",
        "Lists the resume versions an external application can be marked as sent with"
      )
    )
    .input(z.object({}))
    .output(z.array(resumeVersionRefSchema))
    .query(({ ctx }) =>
      new TrackerService(db).resumeVersionOptions(ctx.userId)
    ),

  metrics: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "GET",
        "/tracker/metrics",
        "Response rates, time to first response and high-fit interviews over a period"
      )
    )
    .input(z.object({ period: metricsPeriodSchema }))
    .output(trackerMetricsSchema)
    .query(({ ctx, input }) =>
      new TrackerService(db).metrics({ userId: ctx.userId, ...input })
    ),

  addDeclineReasonAsRule: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "POST",
        "/applications/by-id/{applicationId}/decline-reason/discard-rule",
        "Adds the decline reason to the discard rules of the job preferences"
      )
    )
    .input(applicationInput)
    .output(z.object({ text: z.string() }))
    .mutation(({ ctx, input }) =>
      new TrackerService(db).addDeclineReasonAsRule({
        userId: ctx.userId,
        language: templateLanguage(ctx),
        ...input,
      })
    ),

  excludeCompany: userProcedure
    .meta(
      openApiMeta(
        "tracker",
        "POST",
        "/applications/by-id/{applicationId}/exclude-company",
        "Adds the application's company to the excluded companies of the job preferences"
      )
    )
    .input(
      applicationInput.extend({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .output(z.object({ company: z.string() }))
    .mutation(({ ctx, input }) =>
      new TrackerService(db).excludeCompany({
        userId: ctx.userId,
        language: templateLanguage(ctx),
        ...input,
      })
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
