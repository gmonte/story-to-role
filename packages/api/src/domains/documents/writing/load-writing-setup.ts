import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { TasksRepository } from "@repo/api/domains/tasks/tasks-repository";
import { UsersRepository } from "@repo/api/domains/users/users-repository";
import type { DbClient } from "@repo/api/tools/db-client";

import { DocumentsRepository } from "../documents-repository";
import {
  defaultGenerationSettings,
  type GenerationSettings,
  generationSettingsSchema,
} from "../schemas/generation-settings";
import {
  defaultTemplateSections,
  type ResumeHeaderFields,
  resumeHeaderFieldsSchema,
  type StyleProfile,
  styleProfileSchema,
  type TemplateSection,
} from "../schemas/template";

export type WritingSetup = {
  templateSections: TemplateSection[];
  header: ResumeHeaderFields;
  /** The user's generation settings: their defaults over the product's. */
  generationSettings: GenerationSettings;
  /** Null until the user approves one. */
  style: StyleProfile | null;
  styleDraft: StyleProfile | null;
  styleStatus: "none" | "extracting" | "draft" | "approved";
};

/**
 * The user's global template, header and style profile. Until the user
 * fills the header, it starts from the account's name and email.
 */
export async function loadWritingSetup(input: {
  db: DbClient;
  cipher: UserCipher;
  userId: string;
}): Promise<WritingSetup> {
  const profile = await new CareerRepository(input.db).findProfileByUserId(
    input.userId
  );
  const documents = new DocumentsRepository(input.db);
  const template = profile ? await documents.findTemplate(profile.id) : null;
  const styleRow = profile
    ? await documents.findStyleProfile(profile.id)
    : null;
  const user = await new UsersRepository(input.db).findById(input.userId);

  const header = template?.encryptedHeader
    ? resumeHeaderFieldsSchema.parse(
        JSON.parse(input.cipher.decrypt(template.encryptedHeader))
      )
    : {
        name: user?.fullName ?? "",
        email: user?.email ?? "",
        phone: "",
        linkedin: "",
        github: "",
        city: "",
      };
  const style = styleRow?.encryptedProfile
    ? styleProfileSchema.parse(
        JSON.parse(input.cipher.decrypt(styleRow.encryptedProfile))
      )
    : null;
  // Samples with no profile are extracting only while their task runs: a
  // failed or crashed one lets the user extract again.
  const extracting =
    !!profile &&
    !!styleRow &&
    !style &&
    !!(await new TasksRepository(input.db).activeTask(
      profile.id,
      "extract_style_profile"
    ));

  return {
    templateSections: withEveryCatalogSection(
      template?.sections ?? defaultTemplateSections
    ),
    header,
    generationSettings: generationSettingsSchema
      .catch(defaultGenerationSettings)
      .parse({ ...defaultGenerationSettings, ...template?.generationSettings }),
    style: styleRow?.approvedAt ? style : null,
    styleDraft: style,
    styleStatus: !style
      ? extracting
        ? "extracting"
        : "none"
      : styleRow?.approvedAt
        ? "approved"
        : "draft",
  };
}

/** Sections added to the catalog later appear in older templates too. */
function withEveryCatalogSection(sections: TemplateSection[]) {
  return [
    ...sections,
    ...defaultTemplateSections.filter(
      (section) => !sections.some((row) => row.kind === section.kind)
    ),
  ];
}
