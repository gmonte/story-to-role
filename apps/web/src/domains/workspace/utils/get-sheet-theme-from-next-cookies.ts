import "server-only";

import { cookies } from "next/headers";

import { getCookieConfig } from "@repo/common/tools/cookies/common";

import { type SheetTheme, sheetThemeSchema } from "./sheet-theme";

/** The sheet's look the user chose; until they choose, it follows the theme. */
export async function getSheetThemeFromNextCookies(): Promise<SheetTheme> {
  const cookieStore = await cookies();
  const chosen = sheetThemeSchema.safeParse(
    cookieStore.get(getCookieConfig("sheet-theme").name)?.value
  );
  return chosen.success ? chosen.data : "auto";
}
