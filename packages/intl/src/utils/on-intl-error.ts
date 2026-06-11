import { IntlErrorCode, type OnErrorFn } from "@formatjs/intl";

import { logger } from "@repo/common/tools/logger";

export const onIntlError: OnErrorFn = (error) => {
  if (
    process.env.NODE_ENV !== "production" &&
    error.code === IntlErrorCode.MISSING_TRANSLATION
  ) {
    return;
  }
  logger.error(["intl", "on-intl-error"], error);
};
