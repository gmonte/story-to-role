import { z } from "zod";

import {
  documentKindSchema,
  outputLanguageSchema,
} from "@repo/api/domains/documents/schemas/document";
import { fitBandSchema } from "@repo/api/domains/openings/schemas/opening";

import {
  applicationSourceSchema,
  applicationStatusSchema,
} from "./application";

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
  // The method's fields; next step is free text (encrypted, never in a prompt).
  source: applicationSourceSchema.nullable(),
  nextStep: z.string().nullable(),
  // The opening's latest fit band (the list view only; the detail leaves it empty).
  fitBand: fitBandSchema.nullable(),
  // The next dated event still ahead, if any.
  nextEvent: z
    .object({ occurredAt: z.date(), text: z.string().nullable() })
    .nullable(),
});
export type TrackedApplication = z.infer<typeof trackedApplicationSchema>;

/** A resume version, as the tracker names it. */
export const resumeVersionRefSchema = z.object({
  versionId: z.uuid(),
  label: z.string().nullable(),
  language: outputLanguageSchema,
});
export type ResumeVersionRef = z.infer<typeof resumeVersionRefSchema>;

export const applicationDetailSchema = trackedApplicationSchema.extend({
  sourceDetail: z.string().nullable(),
  notes: z.string().nullable(),
  declineReason: z.string().nullable(),
  // The resume sent: from the submissions when sent from StoryToRole,
  // else the one picked by hand (external applications).
  resumeSent: resumeVersionRefSchema.nullable(),
  resumeSentAutomatically: z.boolean(),
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
  // Follow-up: days since applying; "No response" soon: days left until it
  // closes; an upcoming event: 0 (its time is `date`).
  days: z.number().int(),
  // The event's time, or when "No response" closes the application.
  date: z.date().nullable(),
  text: z.string().nullable(),
});
export type Reminder = z.infer<typeof reminderSchema>;

export const metricsPeriodSchema = z.enum(["30d", "90d", "all"]);
export type MetricsPeriod = z.infer<typeof metricsPeriodSchema>;

const metricsGroup = {
  sent: z.number().int(),
  responded: z.number().int(),
};

/**
 * The method's simple metrics (tracker spec, "Metrics"), over the
 * applications sent in a period. Computed from structured fields only.
 */
export const trackerMetricsSchema = z.object({
  period: metricsPeriodSchema,
  sent: z.number().int(),
  responded: z.number().int(),
  interviews: z.number().int(),
  // The resume sent, by where it came from: written for the opening, copied
  // or adapted from a library document (one row per document), or not
  // recorded.
  byOrigin: z.array(
    z.object({
      origin: z.enum(["generated", "library", "unknown"]),
      libraryDocumentId: z.uuid().nullable(),
      label: z.string().nullable(),
      ...metricsGroup,
    })
  ),
  // The resume sent, by its review score against the target.
  byScore: z.array(
    z.object({ band: z.enum(["reached", "below", "none"]), ...metricsGroup })
  ),
  // The opening's fit band when it was applied to; null when never checked.
  byFit: z.array(z.object({ band: fitBandSchema.nullable(), ...metricsGroup })),
  bySource: z.array(
    z.object({ source: applicationSourceSchema.nullable(), ...metricsGroup })
  ),
  // The median days from applying to the first response, and how many
  // applications it rests on.
  medianDaysToResponse: z.number().nullable(),
  daysToResponseSample: z.number().int(),
  highFit: z.object({
    total: z.number().int(),
    interviews: z.number().int(),
  }),
});
export type TrackerMetrics = z.infer<typeof trackerMetricsSchema>;

/**
 * Where an opening stands on the Openings page (tracker spec, “Where an
 * opening stands”): its application's status, else Analyzed, or Closed for
 * a closed opening with no application.
 */
export const boardStatusSchema = z.enum([
  "analyzed",
  ...applicationStatusSchema.options,
  "closed",
]);
export type BoardStatus = z.infer<typeof boardStatusSchema>;

export const boardStateSchema = z.enum(["open", "closed"]);
export type BoardState = z.infer<typeof boardStateSchema>;

/** The resume an application sent (or will): written for it, or a library one. */
export const resumeOriginSchema = z.enum([
  "written",
  "library",
  "not_recorded",
]);
export type ResumeOrigin = z.infer<typeof resumeOriginSchema>;

export const fitFilterSchema = z.enum([
  ...fitBandSchema.options,
  "not_checked",
]);
export type FitFilter = z.infer<typeof fitFilterSchema>;

export const sentFilterSchema = z.enum(["sent", "not_sent"]);
export type SentFilter = z.infer<typeof sentFilterSchema>;

export const boardSortSchema = z.enum([
  "activity",
  "sent",
  "company",
  "status",
]);
export type BoardSort = z.infer<typeof boardSortSchema>;

const filterText = z.string().trim().min(1).max(200);

/**
 * The Openings page's filter: each field's values to match (`status`) or
 * to leave out (`statusNot`); values of a field combine with OR, fields
 * with AND. Flat, so a GET carries it as query parameters.
 */
export const boardFilterSchema = z.object({
  status: z.array(boardStatusSchema).optional(),
  statusNot: z.array(boardStatusSchema).optional(),
  state: z.array(boardStateSchema).optional(),
  stateNot: z.array(boardStateSchema).optional(),
  company: z.array(filterText).optional(),
  companyNot: z.array(filterText).optional(),
  source: z.array(applicationSourceSchema).optional(),
  sourceNot: z.array(applicationSourceSchema).optional(),
  fit: z.array(fitFilterSchema).optional(),
  fitNot: z.array(fitFilterSchema).optional(),
  sent: z.array(sentFilterSchema).optional(),
  sentNot: z.array(sentFilterSchema).optional(),
  resume: z.array(resumeOriginSchema).optional(),
  resumeNot: z.array(resumeOriginSchema).optional(),
  // Free text: company or title.
  q: filterText.optional(),
});
export type BoardFilter = z.infer<typeof boardFilterSchema>;

/** One opening on the Openings page's list or kanban. */
export const boardOpeningSchema = z.object({
  openingId: z.uuid(),
  applicationId: z.uuid().nullable(),
  company: z.string().nullable(),
  title: z.string().nullable(),
  status: boardStatusSchema,
  state: boardStateSchema,
  external: z.boolean(),
  lastActivityAt: z.date(),
  appliedAt: z.date().nullable(),
  source: applicationSourceSchema.nullable(),
  fitBand: fitBandSchema.nullable(),
  // Null for an opening with no application.
  resumeOrigin: resumeOriginSchema.nullable(),
  // The next dated event still ahead, if any.
  nextEvent: z
    .object({ occurredAt: z.date(), text: z.string().nullable() })
    .nullable(),
  // The method's next step (free text, encrypted, never in a prompt).
  nextStep: z.string().nullable(),
});
export type BoardOpening = z.infer<typeof boardOpeningSchema>;
