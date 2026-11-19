"use client";

import type {
  FitBand,
  FitVerdict,
  OpeningRejectionReason,
  OpeningTermCategory,
  OpeningWarning,
  Tone,
} from "@repo/api/domains/openings/schemas/opening";
import { useTranslation } from "@repo/intl/use-translation";

export function useOpeningLabels() {
  const t = useTranslation();

  return {
    band(band: FitBand) {
      switch (band) {
        case "high":
          return t.formatMessage({ defaultMessage: "High fit" });
        case "medium":
          return t.formatMessage({ defaultMessage: "Medium fit" });
        case "low":
          return t.formatMessage({ defaultMessage: "Low fit" });
      }
    },
    verdict(verdict: FitVerdict) {
      switch (verdict) {
        case "met":
          return t.formatMessage({ defaultMessage: "Met" });
        case "partial":
          return t.formatMessage({ defaultMessage: "Partial" });
        case "gap":
          return t.formatMessage({ defaultMessage: "Gap" });
      }
    },
    category(category: OpeningTermCategory) {
      switch (category) {
        case "hard_skill":
          return t.formatMessage({ defaultMessage: "Skill" });
        case "tool":
          return t.formatMessage({ defaultMessage: "Tool" });
        case "certification":
          return t.formatMessage({ defaultMessage: "Certification" });
        case "language":
          return t.formatMessage({ defaultMessage: "Language" });
        case "seniority":
          return t.formatMessage({ defaultMessage: "Seniority" });
        case "years_of_experience":
          return t.formatMessage({ defaultMessage: "Experience" });
        case "location":
          return t.formatMessage({ defaultMessage: "Location" });
        case "work_model":
          return t.formatMessage({ defaultMessage: "Work model" });
        case "condition":
          return t.formatMessage({ defaultMessage: "Condition" });
        case "other":
          return t.formatMessage({ defaultMessage: "Requirement" });
      }
    },
    warning(warning: OpeningWarning) {
      switch (warning) {
        case "vague_company":
          return t.formatMessage({
            defaultMessage:
              "The description is too vague to identify the company.",
          });
        case "messaging_only_contact":
          return t.formatMessage({
            defaultMessage:
              "Contact is only through a messaging app, with no corporate channel.",
          });
        case "pay_too_good":
          return t.formatMessage({
            defaultMessage:
              "The pay promised is far above the market, with no requirements.",
          });
        case "asks_payment_or_data":
          return t.formatMessage({
            defaultMessage:
              "It asks for payment or sensitive data before any conversation.",
          });
        case "code_download_test":
          return t.formatMessage({
            defaultMessage:
              "Its test requires downloading and running code outside known platforms.",
          });
      }
    },
    tone(tone: Tone) {
      switch (tone) {
        case "your_style":
          return t.formatMessage({ defaultMessage: "Your style" });
        case "formal":
          return t.formatMessage({ defaultMessage: "Formal" });
        case "direct":
          return t.formatMessage({ defaultMessage: "Direct" });
        case "warm":
          return t.formatMessage({ defaultMessage: "Warm" });
        case "technical":
          return t.formatMessage({ defaultMessage: "Technical" });
      }
    },
    rejection(reason: OpeningRejectionReason | null) {
      switch (reason) {
        case "not_an_opening":
          return t.formatMessage({
            defaultMessage: "This text doesn't look like an opening.",
          });
        case "link_needs_paste":
        case "link_unreachable":
        case "link_unsupported_type":
        case "link_too_large":
          return t.formatMessage({
            defaultMessage:
              "We couldn't read that page. Paste the opening's text instead.",
          });
        case "link_blocked_address":
        case "link_invalid_url":
        case "link_too_many_redirects":
          return t.formatMessage({
            defaultMessage: "That link can't be read.",
          });
        default:
          return t.formatMessage({
            defaultMessage: "This opening couldn't be analyzed.",
          });
      }
    },
  };
}
