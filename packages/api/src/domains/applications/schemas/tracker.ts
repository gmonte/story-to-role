import { z } from "zod";

import {
  documentKindSchema,
  outputLanguageSchema,
} from "@repo/api/domains/documents/schemas/document";

import { applicationStatusSchema } from "./application";

/**
 * A timeline entry: a status change, or something that happened (or will:
 * an interview booked, a test due).
 */
export const applicationEventKindSchema = z.enum(["status_change", "note"]);
export type ApplicationEventKind = z.infer<typeof applicationEventKindSchema>;

export const applicationEventSchema = z.object({
  id: z.uuid(),
  kind: applicationEventKindSchema,
  occurredAt: z.date(),
  text: z.string().nullable(),
  fromStatus: applicationStatusSchema.nullable(),
  toStatus: applicationStatusSchema.nullable(),
});
export type ApplicationEvent = z.infer<typeof applicationEventSchema>;

export const applicationSubmissionSchema = z.object({
  versionId: z.uuid(),
  snapshotId: z.uuid(),
  documentKind: documentKindSchema,
  language: outputLanguageSchema,
  label: z.string().nullable(),
  sentAt: z.date(),
});

export const trackedApplicationSchema = z.object({
  id: z.uuid(),
  openingId: z.uuid(),
  company: z.string().nullable(),
  title: z.string().nullable(),
  status: applicationStatusSchema,
  external: z.boolean(),
  statusChangedAt: z.date(),
  lastActivityAt: z.date(),
  appliedAt: z.date().nullable(),
  // The next dated event still ahead, if any.
  nextEvent: z
    .object({ occurredAt: z.date(), text: z.string().nullable() })
    .nullable(),
});
export type TrackedApplication = z.infer<typeof trackedApplicationSchema>;

export const applicationDetailSchema = trackedApplicationSchema.extend({
  events: z.array(applicationEventSchema),
  submissions: z.array(applicationSubmissionSchema),
});
export type ApplicationDetail = z.infer<typeof applicationDetailSchema>;

export const trackerSettingsSchema = z.object({
  remindersEnabled: z.boolean(),
  followUpDays: z.number().int().min(1).max(90),
  noResponseDays: z.number().int().min(7).max(180),
});
export type TrackerSettings = z.infer<typeof trackerSettingsSchema>;

/** An in-app reminder (tracker spec, "Reminders"). */
export const reminderSchema = z.object({
  key: z.string(),
  kind: z.enum(["follow_up", "upcoming_event", "no_response_soon"]),
  applicationId: z.uuid(),
  openingId: z.uuid(),
  company: z.string().nullable(),
  title: z.string().nullable(),
  // Days since applying (follow-up), the event's date, or the closing date.
  days: z.number().int(),
  date: z.date().nullable(),
  text: z.string().nullable(),
});
export type Reminder = z.infer<typeof reminderSchema>;
