import type { DbClient } from "@repo/api/tools/db-client";

import { aiUsageTable } from "./db/ai-tables";

export class AiUsageRepository {
  constructor(private readonly tx: DbClient) {}

  async record(usage: typeof aiUsageTable.$inferInsert) {
    await this.tx.insert(aiUsageTable).values(usage);
  }
}
