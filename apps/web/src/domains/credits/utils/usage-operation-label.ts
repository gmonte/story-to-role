import type { UsageOperation } from "@repo/api/domains/credits/schemas/usage-statement";
import type { useTranslation } from "@repo/intl/use-translation";

type Translation = ReturnType<typeof useTranslation>;

/** What an operation of the usage statement was, in the user's words. */
export function usageOperationLabel(t: Translation, operation: UsageOperation) {
  if (!operation.taskType) {
    return (
      {
        gap_answer_sentence: t.formatMessage({
          defaultMessage: "Gap answer turned into a sentence",
        }),
        check_lines_against_profile: t.formatMessage({
          defaultMessage: "Document lines checked against the profile",
        }),
      }[operation.purpose ?? ""] ??
      operation.purpose ??
      ""
    );
  }
  if (operation.taskType === "generate_document") {
    return documentLabel(t, operation);
  }
  if (operation.taskType === "adapt_document") {
    return operation.generationKind === "sync"
      ? t.formatMessage({ defaultMessage: "Language sync" })
      : t.formatMessage({ defaultMessage: "Adaptation to another language" });
  }
  return {
    sample: t.formatMessage({ defaultMessage: "Sample task" }),
    analyze_opening: t.formatMessage({ defaultMessage: "Fit check" }),
    extract_style_profile: t.formatMessage({
      defaultMessage: "Style profile",
    }),
    split_instructions: t.formatMessage({
      defaultMessage: "Application instructions split",
    }),
    review_document: t.formatMessage({ defaultMessage: "Coverage review" }),
    render_pdf: t.formatMessage({ defaultMessage: "PDF" }),
    research_company: t.formatMessage({ defaultMessage: "Company research" }),
    motivation_turn: t.formatMessage({
      defaultMessage: "Motivation interview message",
    }),
    linkedin_turn: t.formatMessage({ defaultMessage: "LinkedIn step message" }),
    validate_profile: t.formatMessage({
      defaultMessage: "Profile validation",
    }),
    embed_profile: t.formatMessage({ defaultMessage: "Profile indexing" }),
    profile_agent_turn: t.formatMessage({
      defaultMessage: "Message to the profile agent",
    }),
    document_agent_turn: t.formatMessage({
      defaultMessage: "Message to the document agent",
    }),
    import_document: t.formatMessage({
      defaultMessage: "Resume or truth file import",
    }),
  }[operation.taskType];
}

function documentLabel(t: Translation, operation: UsageOperation) {
  switch (operation.generationKind) {
    case "letter_update":
      return t.formatMessage({ defaultMessage: "Cover letter update" });
    case "linkedin_section":
      return t.formatMessage({
        defaultMessage: "LinkedIn text section rewritten",
      });
    case "linkedin_review":
      return t.formatMessage({ defaultMessage: "LinkedIn text review" });
    case "adapt":
      return t.formatMessage({
        defaultMessage: "Adaptation to another language",
      });
    case "sync":
      return t.formatMessage({ defaultMessage: "Language sync" });
  }
  switch (operation.documentKind) {
    case "resume":
      return t.formatMessage({ defaultMessage: "Resume creation" });
    case "cover_letter":
      return t.formatMessage({ defaultMessage: "Cover letter creation" });
    case "linkedin":
      return t.formatMessage({ defaultMessage: "LinkedIn text creation" });
    default:
      return t.formatMessage({ defaultMessage: "Document creation" });
  }
}
