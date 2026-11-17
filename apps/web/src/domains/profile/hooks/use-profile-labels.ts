"use client";

import { useTranslation } from "@repo/intl/use-translation";
import type { ProfileEntryKind } from "@repo/api/domains/profile/truth/insert";
import type { ProfileFinding } from "@repo/api/domains/profile/truth/lint";
import type { ValidationFindingKind } from "@repo/api/domains/profile/schemas/validation";
import {
  sectionHeadings,
  type CompetencyLevel,
  type ProfileLanguage,
  type ProfileSectionKey,
} from "@repo/api/domains/profile/truth/sections";

/** The profile editor's words: findings, section hints and entry names. */
export function useProfileLabels() {
  const t = useTranslation();

  function findingMessage(finding: ProfileFinding, language: ProfileLanguage) {
    const params = finding.params ?? {};
    const section = params.section
      ? sectionHeadings[language][params.section as ProfileSectionKey].replace(
          /\s*\(.*\)$/,
          ""
        )
      : "";
    switch (finding.code) {
      case "missingSection":
        return t.formatMessage(
          { defaultMessage: "The “{section}” section is missing." },
          { section }
        );
      case "sectionOrder":
        return t.formatMessage(
          { defaultMessage: "“{section}” is out of the template's order." },
          { section }
        );
      case "experienceTitle":
        return t.formatMessage({
          defaultMessage:
            "Write the title as “Company — Title (YYYY-MM to YYYY-MM)”, with “present” for the current position.",
        });
      case "dateFormat":
        return t.formatMessage({ defaultMessage: "Write dates as YYYY-MM." });
      case "educationFormat":
        return t.formatMessage({
          defaultMessage:
            "Write education as “Course — Institution — completed” or “… — in progress until YYYY-MM”.",
        });
      case "certificationFormat":
        return t.formatMessage({
          defaultMessage:
            "Write a certification as “Name — Issuer — date — status”.",
        });
      case "certificationStatus":
        return t.formatMessage({
          defaultMessage:
            "Say whether the certification is valid, expired in YYYY-MM or renewing.",
        });
      case "competencyLevel":
        return t.formatMessage({
          defaultMessage:
            "Put each competency under a level: master, use often, or studied without professional experience.",
        });
      case "markFormat":
        return t.formatMessage({
          defaultMessage: "Write the figure's mark the canonical way.",
        });
      case "unmarkedFigure":
        return t.formatMessage({
          defaultMessage:
            "Say where this figure comes from: measured, estimated, no number or to confirm.",
        });
      case "missingNotDone":
        return t.formatMessage({
          defaultMessage:
            "Say what you did not do in this position, so nothing gets overstated.",
        });
      case "experienceOrder":
        return t.formatMessage({
          defaultMessage: "Experiences go most recent first.",
        });
      case "experienceOverlap":
        return t.formatMessage({
          defaultMessage:
            "These dates overlap the next experience; check them if they weren't concurrent.",
        });
      case "expiredWithoutDate":
        return t.formatMessage({
          defaultMessage: "Say when the certification expired (YYYY-MM).",
        });
      case "competencyMissing":
        return t.formatMessage(
          {
            defaultMessage: "“{name}” is used here but isn't in Competencies.",
          },
          { name: params.name }
        );
      case "competencyUnbacked":
        return t.formatMessage(
          {
            defaultMessage:
              "No experience mentions “{name}”: move it to “studied” or say where you used it.",
          },
          { name: params.name }
        );
      case "studiedUsed":
        return t.formatMessage(
          {
            defaultMessage:
              "“{name}” is listed as studied without professional experience, but this experience uses it.",
          },
          { name: params.name }
        );
      case "neverInclude":
        return t.formatMessage(
          {
            defaultMessage:
              "“{term}” is under “never include” in your communication rules.",
          },
          { term: params.term }
        );
    }
  }

  const sectionHints: Partial<Record<ProfileSectionKey, string>> = {
    experience: t.formatMessage({
      defaultMessage:
        "Add each position with + or /: company, title and dates, most recent first.",
    }),
    education: t.formatMessage({
      defaultMessage: "Add your courses with + or /.",
    }),
    certifications: t.formatMessage({
      defaultMessage:
        "Add certifications with + or /, expired ones too, with their date.",
    }),
    languages: t.formatMessage({
      defaultMessage: "Add each language with your real level.",
    }),
    gaps: t.formatMessage({
      defaultMessage:
        "What you don't have or haven't done, stated plainly: it keeps answers from being invented.",
    }),
    addenda: t.formatMessage({
      defaultMessage:
        "Details remembered later, dated, to fold into the sections.",
    }),
  };

  const entryLabels: Record<ProfileEntryKind, string> = {
    experience: t.formatMessage({ defaultMessage: "Experience" }),
    education: t.formatMessage({ defaultMessage: "Education" }),
    certification: t.formatMessage({ defaultMessage: "Certification" }),
    language: t.formatMessage({ defaultMessage: "Language" }),
    competency: t.formatMessage({ defaultMessage: "Competency" }),
    gap: t.formatMessage({ defaultMessage: "Known gap" }),
    rule: t.formatMessage({ defaultMessage: "Communication rule" }),
    addendum: t.formatMessage({ defaultMessage: "Addendum" }),
  };

  const reviewKinds: Record<ValidationFindingKind, string> = {
    noImpact: t.formatMessage({ defaultMessage: "Impact unclear" }),
    mixedOwnership: t.formatMessage({ defaultMessage: "Yours or the team's?" }),
    inconsistentFigure: t.formatMessage({ defaultMessage: "Figures disagree" }),
    figureWithoutOrigin: t.formatMessage({ defaultMessage: "Figure's origin" }),
    emptyNotDone: t.formatMessage({ defaultMessage: "What you didn't do" }),
    unknown: t.formatMessage({ defaultMessage: "Still unknown" }),
  };

  const levelLabels: Record<CompetencyLevel, string> = {
    master: t.formatMessage({ defaultMessage: "I master it" }),
    often: t.formatMessage({ defaultMessage: "I use it often" }),
    studied: t.formatMessage({
      defaultMessage: "Studied, without professional experience",
    }),
  };

  return {
    findingMessage,
    sectionHints,
    entryLabels,
    reviewKinds,
    levelLabels,
  };
}
