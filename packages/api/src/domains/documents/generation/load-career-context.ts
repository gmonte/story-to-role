import { InstructionsRepository } from "@repo/api/domains/applications/instructions-repository";
import {
  type LockedField,
  positionFieldOf,
} from "@repo/api/domains/applications/schemas/instructions";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { SensitiveFilter } from "@repo/api/domains/evidence/sensitive/sensitive-filter";
import type { DbClient } from "@repo/api/tools/db-client";

import {
  approvedTitles,
  loadTitleEquivalents,
} from "../adaptation/title-equivalents";
import type { OutputLanguage } from "../schemas/document";
import type { ResumeHeaderFields } from "../schemas/template";
import { loadProfileSource } from "./load-profile-source";
import type {
  SourceCredential,
  SourceEvidence,
  SourcePosition,
} from "./profile-source";

export type ContextPosition = SourcePosition;

export type ContextEvidence = SourceEvidence & {
  credentialId: string | null;
  projectId: string | null;
};

export type ContextCredential = SourceCredential;

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
  // The published version everything here was read from (ADR 0008); null
  // when the user has published none.
  profileVersionId: string | null;
  header: ResumeHeaderFields;
  positions: ContextPosition[];
  evidence: ContextEvidence[];
  credentials: ContextCredential[];
  skills: Array<{ id: string; name: string; evidenceIds: string[] }>;
  projects: Array<{ id: string; positionId: string; name: string }>;
  instructions: ContextInstruction[];
  // Each fit check passage's evidence lines.
  evidenceOfPassage: Map<string, string[]>;
  rules: { neverInclude: string[]; neverClaim: string[] };
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

// What the filter writes where it takes a term out of a prompt.
const omitted = "[omitted]";

const confidentialLabels: Record<OutputLanguage, string> = {
  "en-US": "Confidential",
  "pt-BR": "Confidencial",
};

const emptyHeader: ResumeHeaderFields = {
  name: "",
  email: "",
  phone: "",
  linkedin: "",
  github: "",
  city: "",
};

/**
 * The career as generation may see it: a published version of the profile,
 * the only source of facts (resume spec, "Generation rules"), with what its
 * communication rules forbid taken out by code. A document reads the
 * version it froze; anything else reads the one published now. For an
 * opening, it adds the instructions the user kept for its application and
 * applies their confirmed locked-fact overrides.
 */
export async function loadCareerContext(input: {
  db: DbClient;
  cipher: UserCipher;
  profileId: string;
  filter: SensitiveFilter;
  profileVersionId?: string | null;
  openingId?: string;
  /** Prints each position's approved title equivalent in this language. */
  language?: OutputLanguage;
}): Promise<CareerContext> {
  const { db, cipher, profileId, filter } = input;
  const source = await loadProfileSource({
    db,
    cipher,
    profileId,
    profileVersionId: input.profileVersionId,
  });

  // Locked facts are printed by code, so code applies the rules too. An
  // employer the rules say never to include prints as confidential, in the
  // document's language; a title keeps what is left of it.
  const forbidden = (text: string) =>
    filter.findForbiddenTerms(text).length > 0;
  const without = (text: string) =>
    filter
      .apply(text)
      .replaceAll(omitted, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s,–—-]+|[\s,–—-]+$/g, "");
  const confidential = confidentialLabels[input.language ?? "en-US"];
  const printed = {
    employer: (value: string) => (forbidden(value) ? confidential : value),
    title: (value: string) =>
      forbidden(value) ? without(value) || confidential : value,
  };
  const positions = (source?.positions ?? []).map((position) => ({
    ...position,
    employer: printed.employer(position.employer),
    title: printed.title(position.title),
  }));
  const positionIds = new Set(positions.map((position) => position.id));
  // A credential that names something never to include is left out.
  const credentials = (source?.credentials ?? []).filter(
    (credential) =>
      !forbidden(
        [credential.title, credential.institution, credential.level]
          .filter(Boolean)
          .join(" ")
      )
  );
  const credentialIds = new Set(credentials.map((row) => row.id));
  // A line that names something never to include is left out whole.
  const kept = new Set(
    filter.dropFactsMentioningExcluded(
      (source?.evidence ?? []).map((row) => row.text)
    )
  );
  const evidence = (source?.evidence ?? [])
    .filter((row) => kept.has(row.text))
    .map((row) => ({ ...row, credentialId: null, projectId: null }));

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
            // An override is printed by code too, under the same rules.
            value:
              row.field === "employer" || row.field === "title"
                ? printed[row.field](value)
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
    profileVersionId: source?.profileVersionId ?? null,
    header: source?.header ?? emptyHeader,
    positions: applyLockedFactOverrides(titled, overrides),
    evidence,
    credentials,
    skills: source?.skills ?? [],
    projects: [],
    instructions,
    evidenceOfPassage: source?.evidenceOfPassage ?? new Map<string, string[]>(),
    rules: source?.rules ?? { neverInclude: [], neverClaim: [] },
  };
}
