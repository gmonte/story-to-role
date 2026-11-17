import type { TRPCContext } from "@repo/api/tools/trpc";

import type { ProfileLanguage } from "./truth/sections";

/** A new document starts from the template in the interface language. */
export function templateLanguage(ctx: Pick<TRPCContext, "t">): ProfileLanguage {
  return ctx.t.locale === "pt-BR" ? "pt-BR" : "en-US";
}
