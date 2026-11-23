"use server";

import { cookies } from "next/headers";

import { getCookieConfig } from "@repo/common/tools/cookies/common";

import { type SheetTheme, sheetThemeSchema } from "../utils/sheet-theme";

/** Keeps the sheet's look the user chose, for a year. */
export async function setSheetThemeAction(sheetTheme: SheetTheme) {
  const cookieStore = await cookies();
  const config = getCookieConfig("sheet-theme");
  cookieStore.set(config.name, sheetThemeSchema.parse(sheetTheme), {
    ...config.options,
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
  });
}
