type LocaleMetadata = {
  name: string;
  translatedName: string;
  rtl: boolean;
};

const locales = {
  "en-US": {
    name: "English",
    translatedName: "English",
    rtl: false,
  },
  "pt-BR": {
    name: "Português (BR)",
    translatedName: "Português (BR)",
    rtl: false,
  },
} satisfies Record<string, LocaleMetadata>;

export type Locale = keyof typeof locales;

export const intlConfig = {
  defaultLocale: "en-US" as Locale,
  localeCodes: Object.keys(locales) as Locale[],
  locales,
};
