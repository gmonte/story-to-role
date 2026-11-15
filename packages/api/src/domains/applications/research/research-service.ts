import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";

import type { CompanyResearch } from "../schemas/research";
import { ResearchRepository } from "./research-repository";

const notFound = () => new TRPCError({ code: "NOT_FOUND" });

/**
 * Company research from the user's side (resume spec, "Cover letter
 * inputs"): run on request, then the user selects which facts a cover
 * letter may use. There is no shared cache across users.
 */
export class ResearchService {
  constructor(
    private readonly db: DbClient,
    private readonly tasks = new TasksService(db)
  ) {}

  private async requireOpening(userId: string, openingId: string) {
    const profile = await new CareerRepository(this.db).findProfileByUserId(
      userId
    );
    const opening =
      profile &&
      (await new OpeningsRepository(this.db).findOpening({
        profileId: profile.id,
        openingId,
      }));
    if (!profile || !opening) throw notFound();
    return { profile, opening };
  }

  async get(input: {
    userId: string;
    openingId: string;
  }): Promise<CompanyResearch> {
    const { opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    return this.db.transaction(async (tx) => {
      const repository = new ResearchRepository(tx);
      const cipher = await getUserCipher(tx, input.userId);
      const latest = await repository.latestResearch(opening.id);
      return {
        status: latest?.status ?? null,
        facts: (await repository.listFacts(opening.id)).map((fact) => ({
          id: fact.id,
          text: cipher.decrypt(fact.encryptedText),
          sourceUrl: cipher.decrypt(fact.encryptedSourceUrl),
          sourceTitle: cipher.decrypt(fact.encryptedSourceTitle),
          approved: !!fact.approvedAt,
        })),
      };
    });
  }

  /** "Research company": a task searches the web within its limit. */
  async start(input: {
    userId: string;
    openingId: string;
  }): Promise<{ realtime: RealtimeSubscription }> {
    const { profile, opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    if (!opening.encryptedCompany) throw new TRPCError({ code: "BAD_REQUEST" });
    const research = await this.db.transaction(async (tx) => {
      const repository = new ResearchRepository(tx);
      const latest = await repository.latestResearch(opening.id);
      if (latest?.status === "researching") {
        throw new TRPCError({ code: "CONFLICT" });
      }
      return repository.insertResearch({
        profileId: profile.id,
        openingId: opening.id,
      });
    });
    const { realtime } = await this.tasks.start({
      userId: input.userId,
      type: "research_company",
      subjectId: research.id,
    });
    return { realtime };
  }

  /** The facts the cover letter may use: those selected, and only those. */
  async select(input: {
    userId: string;
    openingId: string;
    companyFactIds: string[];
  }) {
    const { opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    await this.db.transaction(async (tx) => {
      const repository = new ResearchRepository(tx);
      const facts = await repository.listFacts(opening.id);
      const chosen = new Set(input.companyFactIds);
      const approvedAt = new Date();
      await repository.setApproval(
        facts
          .filter((fact) => chosen.has(fact.id) && !fact.approvedAt)
          .map((fact) => fact.id),
        approvedAt
      );
      await repository.setApproval(
        facts.filter((fact) => !chosen.has(fact.id)).map((fact) => fact.id),
        null
      );
    });
  }
}
