"use client";

import type {
  SensitiveItemKind,
  SensitivityChoice,
} from "@repo/api/domains/evidence/schemas/evidence";
import { useTranslation } from "@repo/intl/use-translation";

/** Interface labels for the sensitive items' enums. */
export function useCareerLabels() {
  const t = useTranslation();

  return {
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
  };
}
