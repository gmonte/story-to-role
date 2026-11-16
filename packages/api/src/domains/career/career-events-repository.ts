import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import { careerEventsTable } from "./db/career-tables";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export class CareerEventsRepository {
  constructor(private readonly tx: DbClient) {}

  async insert(event: Insert<typeof careerEventsTable>) {
    await this.tx.insert(careerEventsTable).values(event);
  }

  /** What the chat hasn't taken in yet, oldest first. */
  listUnseen(profileId: string) {
    return this.tx
      .select()
      .from(careerEventsTable)
      .where(
        and(
          eq(careerEventsTable.profileId, profileId),
          isNull(careerEventsTable.seenAt)
        )
      )
      .orderBy(asc(careerEventsTable.createdAt));
  }

  /** Whether a change worth a word from the chat waits for it. */
  async hasReactivePending(profileId: string) {
    const [row] = await this.tx
      .select({ id: careerEventsTable.id })
      .from(careerEventsTable)
      .where(
        and(
          eq(careerEventsTable.profileId, profileId),
          eq(careerEventsTable.reactive, true),
          isNull(careerEventsTable.seenAt)
        )
      )
      .limit(1);
    return !!row;
  }

  async markSeen(careerEventIds: string[]) {
    if (careerEventIds.length === 0) return;
    await this.tx
      .update(careerEventsTable)
      .set({ seenAt: new Date() })
      .where(inArray(careerEventsTable.id, careerEventIds));
  }
}
