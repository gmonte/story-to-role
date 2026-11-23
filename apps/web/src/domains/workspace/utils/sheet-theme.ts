import { z } from "zod";

/**
 * The document sheet's look, apart from the app's theme: light paper, dark
 * paper, or following the theme ("auto", the default). The PDF is always
 * paper.
 */
export const sheetThemeSchema = z.enum(["light", "dark", "auto"]);
export type SheetTheme = z.infer<typeof sheetThemeSchema>;
