import { InstructionsRepository } from "@repo/api/domains/applications/instructions-repository";
import {
  type LockedField,
  positionFieldOf,
} from "@repo/api/domains/applications/schemas/instructions";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { CredentialKind } from "@repo/api/domains/career/schemas/career";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { EvidenceKind } from "@repo/api/domains/evidence/schemas/evidence";
import type { SensitiveFilter } from "@repo/api/domains/evidence/sensitive/sensitive-filter";
import type { DbClient } from "@repo/api/tools/db-client";

import {
  approvedTitles,
  loadTitleEquivalents,
} from "../adaptation/title-equivalents";
import type { OutputLanguage } from "../schemas/document";

export type ContextPosition = {
  id: string;
  employer: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
};

export type ContextEvidence = {
  id: string;
  positionId: string | null;
  credentialId: string | null;
  projectId: string | null;
  kind: EvidenceKind;
  /** As it may enter a prompt: sensitivity choices already applied. */
  text: string;
  /** A file fact's own words (filtered too); null for interview facts. */
  sourceWording?: string | null;
};

export type ContextCredential = {
  id: string;
  kind: CredentialKind;
  title: string;
  institution: string | null;
  level: string | null;
  startDate: string | null;
  endDate: string | null;
  inProgress: boolean;
};

/** A point the user kept for this application: their statement, unverified. */
export type ContextInstruction = {
  id: string;
  positionId: string | null;
  credentialId: string | null;
  text: string;
};

export type LockedFactOverride = {
  positionId: string;
  field: LockedField;
  value: string;
};

export type CareerContext = {
  positions: ContextPosition[];
  evidence: ContextEvidence[];
  credentials: ContextCredential[];
  skills: Array<{ id: string; name: string; evidenceIds: string[] }>;
  projects: Array<{ id: string; positionId: string; name: string }>;
  instructions: ContextInstruction[];
};

/**
 * Locked-fact overrides (resume spec, "Application instructions"): in this
 * application, code prints the user's declared value instead of the
 * position's, and the locked-fact check expects it there.
 */
export function applyLockedFactOverrides(
  positions: ContextPosition[],
  overrides: LockedFactOverride[]
): ContextPosition[] {
  return positions.map((position) =>
    overrides
      .filter((row) => row.positionId === position.id)
      .reduce(
        (changed, row) => ({
          ...changed,
          [positionFieldOf[row.field]]: row.value,
        }),
        position
      )
  );
}

/**
 * The career as generation may see it: approved positions (most recent
 * first) and credentials, with the user's sensitivity choices applied by
 * code (guided-interview spec, "Sensitive-data control"). For an
 * opening, it adds the instructions the user kept for its application and
 * applies their confirmed locked-fact overrides.
 */
export async function loadCareerContext(input: {
  db: DbClient;
  cipher: UserCipher;
  profileId: string;
  filter: SensitiveFilter;
  openingId?: string;
  /** Prints each position's approved title equivalent in this language. */
  language?: OutputLanguage;
}): Promise<CareerContext> {
  const { db, cipher, profileId, filter } = input;
  const career = new CareerRepository(db);
  const open = (value: string | null) => (value ? cipher.decrypt(value) : null);

  const positions = (await career.listPositions(profileId))
    .filter((position) => position.status === "approved")
    .map((position) => ({
      id: position.id,
      // Locked facts are printed by code, so code applies the choices too.
      employer: filter.apply(cipher.decrypt(position.encryptedEmployer)),
      title: filter.apply(cipher.decrypt(position.encryptedTitle)),
      startDate: position.startDate,
      endDate: position.endDate,
    }))
    .sort(
      (a, b) =>
        (b.endDate ?? "9999").localeCompare(a.endDate ?? "9999") ||
        (b.startDate ?? "").localeCompare(a.startDate ?? "")
    );
  const positionIds = new Set(positions.map((position) => position.id));

  const credentials = (await career.listCredentials(profileId))
    .filter(
      (credential) =>
        credential.approvedAt && credential.status !== "do_not_use"
    )
    .map((credential) => ({
      id: credential.id,
      kind: credential.kind,
      title: filter.apply(cipher.decrypt(credential.encryptedTitle)),
      institution: open(credential.encryptedInstitution)
        ? filter.apply(open(credential.encryptedInstitution)!)
        : null,
      level: credential.level,
      startDate: credential.startDate,
      endDate: credential.endDate,
      inProgress: credential.status === "in_progress",
    }));
  const credentialIds = new Set(credentials.map((row) => row.id));

  // Profile_truth replaces this in P6 (docs/plan.md): no evidence, skills
  // or projects exist until the published profile's extract feeds them.
  const evidence: ContextEvidence[] = [];
  const skills: CareerContext["skills"] = [];
  const projects: CareerContext["projects"] = [];

  const instructionsRepository = new InstructionsRepository(db);
  const instructions = input.openingId
    ? (await instructionsRepository.listPoints(input.openingId))
        .filter((point) => point.status === "kept")
        .map((point) => ({
          id: point.id,
          positionId:
            point.positionId && positionIds.has(point.positionId)
              ? point.positionId
              : null,
          credentialId:
            point.credentialId && credentialIds.has(point.credentialId)
              ? point.credentialId
              : null,
          text: filter.apply(cipher.decrypt(point.encryptedText)),
        }))
    : [];
  const overrides = input.openingId
    ? (await instructionsRepository.listOverrides(input.openingId))
        .filter((row) => row.confirmedAt)
        .map((row) => {
          const value = cipher.decrypt(row.encryptedValue);
          return {
            positionId: row.positionId,
            field: row.field,
            value:
              row.field === "employer" || row.field === "title"
                ? filter.apply(value)
                : value,
          };
        })
    : [];

  const equivalents = input.language
    ? approvedTitles(
        await loadTitleEquivalents({ db, cipher, profileId, filter }),
        input.language
      )
    : new Map<string, string>();
  const titled = positions.map((position) => ({
    ...position,
    title: equivalents.get(position.id) ?? position.title,
  }));

  return {
    positions: applyLockedFactOverrides(titled, overrides),
    evidence,
    credentials,
    skills,
    projects,
    instructions,
  };
}
