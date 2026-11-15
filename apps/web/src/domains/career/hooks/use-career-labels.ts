"use client";

import type { DepthLevel } from "@repo/api/domains/career/depth";
import type {
  CredentialKind,
  PositionStatus,
} from "@repo/api/domains/career/schemas/career";
import type {
  SensitiveItemKind,
  SensitivityChoice,
} from "@repo/api/domains/evidence/schemas/evidence";
import type {
  DraftKind,
  InterviewStage,
} from "@repo/api/domains/interview/schemas/interview";
import { useTranslation } from "@repo/intl/use-translation";

/** Interface labels for the career domain's enums. */
export function useCareerLabels() {
  const t = useTranslation();

  return {
    positionStatus(status: PositionStatus) {
      switch (status) {
        case "pending":
          return t.formatMessage({ defaultMessage: "Pending" });
        case "in_progress":
          return t.formatMessage({ defaultMessage: "In progress" });
        case "approved":
          return t.formatMessage({ defaultMessage: "Approved" });
        case "removed":
          return t.formatMessage({ defaultMessage: "Removed" });
      }
    },
    depth(level: DepthLevel) {
      switch (level) {
        case "confirmed":
          return t.formatMessage({ defaultMessage: "Confirmed" });
        case "contextualized":
          return t.formatMessage({ defaultMessage: "Contextualized" });
        case "with_stories":
          return t.formatMessage({ defaultMessage: "With stories" });
        case "evidenced":
          return t.formatMessage({ defaultMessage: "Evidenced" });
        case "complete":
          return t.formatMessage({ defaultMessage: "Complete" });
      }
    },
    stage(stage: InterviewStage) {
      switch (stage) {
        case "confirm":
          return t.formatMessage({ defaultMessage: "Confirming facts" });
        case "context":
          return t.formatMessage({ defaultMessage: "Context" });
        case "projects":
          return t.formatMessage({ defaultMessage: "Projects" });
        case "stories":
          return t.formatMessage({ defaultMessage: "Stories" });
        case "evidence":
          return t.formatMessage({ defaultMessage: "Evidence" });
        case "boundaries":
          return t.formatMessage({ defaultMessage: "Boundaries" });
      }
    },
    draftKind(kind: DraftKind) {
      switch (kind) {
        case "achievement":
          return t.formatMessage({ defaultMessage: "Achievement" });
        case "responsibility":
          return t.formatMessage({ defaultMessage: "Responsibility" });
        case "metric":
          return t.formatMessage({ defaultMessage: "Metric" });
        case "tool":
          return t.formatMessage({ defaultMessage: "Tool" });
        case "award":
          return t.formatMessage({ defaultMessage: "Award" });
        case "story":
          return t.formatMessage({ defaultMessage: "Story" });
        case "skill":
          return t.formatMessage({ defaultMessage: "Skill" });
      }
    },
    credentialKind(kind: CredentialKind) {
      switch (kind) {
        case "education":
          return t.formatMessage({ defaultMessage: "Education" });
        case "certification":
          return t.formatMessage({ defaultMessage: "Certification" });
        case "language":
          return t.formatMessage({ defaultMessage: "Language" });
        case "course":
          return t.formatMessage({ defaultMessage: "Course" });
        case "publication":
          return t.formatMessage({ defaultMessage: "Publication" });
        case "award":
          return t.formatMessage({ defaultMessage: "Award" });
        case "volunteering":
          return t.formatMessage({ defaultMessage: "Volunteering" });
      }
    },
    sensitiveKind(kind: SensitiveItemKind) {
      switch (kind) {
        case "client":
          return t.formatMessage({ defaultMessage: "Client" });
        case "codename":
          return t.formatMessage({ defaultMessage: "Codename" });
        case "figure":
          return t.formatMessage({ defaultMessage: "Figure" });
        case "person":
          return t.formatMessage({ defaultMessage: "Person" });
      }
    },
    sensitiveChoice(choice: SensitivityChoice) {
      switch (choice) {
        case "use":
          return t.formatMessage({ defaultMessage: "Use" });
        case "generalize":
          return t.formatMessage({ defaultMessage: "Generalize" });
        case "exclude":
          return t.formatMessage({ defaultMessage: "Exclude" });
      }
    },
    period(startDate: string | null, endDate: string | null) {
      const format = (value: string) =>
        t.formatDate(new Date(`${value}-01T12:00:00Z`), {
          month: "short",
          year: "numeric",
        });
      return `${startDate ? format(startDate) : "?"} – ${
        endDate
          ? format(endDate)
          : t.formatMessage({ defaultMessage: "present" })
      }`;
    },
  };
}
