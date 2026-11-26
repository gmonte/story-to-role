import { TrackerService } from "@repo/api/domains/applications/tracker/tracker-service";
import type { ApplicationStatus } from "@repo/api/domains/applications/schemas/application";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { OpeningStatus } from "@repo/api/domains/openings/schemas/opening";

import { getTestDatabase } from "./pglite";

/**
 * An opening the user applied to with nothing from StoryToRole, as a user
 * would record it: added, marked as applied on the day sent (no resume
 * recorded) and, past Applied, moved on that same day.
 */
export async function appliedOpening(input: {
  userId: string;
  profileId: string;
  company?: string;
  title?: string;
  link?: string;
  appliedAt: Date;
  status?: ApplicationStatus;
  openingStatus?: OpeningStatus;
  now?: Date;
}) {
  const db = await getTestDatabase();
  const cipher = await getUserCipher(db, input.userId);
  const opening = await new OpeningsRepository(db).insertOpening({
    profileId: input.profileId,
    kind: "posted",
    status: input.openingStatus ?? "analyzed",
    encryptedCompany: cipher.encrypt(input.company ?? "Globex"),
    encryptedTitle: cipher.encrypt(input.title ?? "Platform Engineer"),
    encryptedSourceUrl: cipher.encrypt(
      input.link ?? "https://example.com/jobs/1"
    ),
    createdAt: input.appliedAt,
  });
  const tracker = new TrackerService(db);
  const { applicationId } = await tracker.ensureForOpening({
    userId: input.userId,
    openingId: opening.id,
  });
  const now =
    input.now && input.now > input.appliedAt ? input.now : input.appliedAt;
  await tracker.markApplied({
    userId: input.userId,
    applicationId,
    versionIds: [],
    appliedAt: input.appliedAt,
    now,
  });
  if (input.status && input.status !== "applied") {
    await tracker.setStatus({
      userId: input.userId,
      applicationId,
      status: input.status,
      now: input.appliedAt,
    });
  }
  return { applicationId, openingId: opening.id };
}
