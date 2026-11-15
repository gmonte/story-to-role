import { InstructionsRepository } from "@repo/api/domains/applications/instructions-repository";
import {
  type LockedField,
  positionFieldOf,
} from "@repo/api/domains/applications/schemas/instructions";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { CredentialKind } from "@repo/api/domains/career/schemas/career";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { EvidenceRepository } from "@repo/api/domains/evidence/evidence-repository";
import type { EvidenceKind } from "@repo/api/domains/evidence/schemas/evidence";
import type { SensitiveFilter } from "@repo/api/domains/evidence/sensitive/sensitive-filter";
import type { DbClient } from "@repo/api/tools/db-client";

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
 * The approved evidence base as generation may see it: approved positions
 * (most recent first) and credentials, and evidence with the user's
 * sensitivity choices applied by code; facts resting on an excluded item
 * are left out (guided-interview spec, "Sensitive-data control"). For an
 * opening, it adds the instructions the user kept for its application and
 * applies their confirmed locked-fact overrides.
 */
export async function loadCareerContext(input: {
  db: DbClient;
  cipher: UserCipher;
  profileId: string;
  filter: SensitiveFilter;
  openingId?: string;
}): Promise<CareerContext> {
  const { db, cipher, profileId, filter } = input;
  const career = new CareerRepository(db);
  const evidenceRepository = new EvidenceRepository(db);
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

  const evidence = (await evidenceRepository.listEvidence(profileId))
    .filter(
      (row) =>
        (!!row.positionId && positionIds.has(row.positionId)) ||
        (!!row.credentialId && credentialIds.has(row.credentialId))
    )
    .map((row) => ({ row, text: cipher.decrypt(row.encryptedText) }))
    .filter(({ text }) => filter.dropFactsMentioningExcluded([text]).length)
    .map(({ row, text }) => ({
      id: row.id,
      positionId: row.positionId,
      credentialId: row.credentialId,
      projectId: row.projectId,
      kind: row.kind,
      text: filter.apply(text),
    }));
  const evidenceIds = new Set(evidence.map((row) => row.id));

  const skills = (await evidenceRepository.listSkills(profileId))
    .map((skill) => ({
      id: skill.id,
      name: filter.apply(cipher.decrypt(skill.encryptedName)),
      evidenceIds: skill.evidenceIds.filter((id) => evidenceIds.has(id)),
    }))
    // A skill is usable only through the evidence that shows it.
    .filter((skill) => skill.evidenceIds.length > 0);

  const projects = (await career.listProjects(profileId))
    .filter((project) => positionIds.has(project.positionId))
    .map((project) => ({
      id: project.id,
      positionId: project.positionId,
      name: filter.apply(cipher.decrypt(project.encryptedName)),
    }));

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

  return {
    positions: applyLockedFactOverrides(positions, overrides),
    evidence,
    credentials,
    skills,
    projects,
    instructions,
  };
}
