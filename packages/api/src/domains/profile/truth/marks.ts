import type { ProfileLanguage } from "./sections";

/** Where a figure comes from (profile spec, "Figure marks"). */
export type FigureMark = "measured" | "estimated" | "noNumber" | "toConfirm";

export const canonicalMarks: Record<
  ProfileLanguage,
  Record<FigureMark, string>
> = {
  "pt-BR": {
    measured: "medido",
    estimated: "estimado",
    noNumber: "sem número",
    toConfirm: "a confirmar",
  },
  "en-US": {
    measured: "measured",
    estimated: "estimated",
    noNumber: "no number",
    toConfirm: "to confirm",
  },
};

const markWords: Record<string, FigureMark> = {
  medido: "measured",
  measured: "measured",
  estimado: "estimated",
  estimated: "estimated",
  "sem numero": "noNumber",
  "no number": "noNumber",
  "a confirmar": "toConfirm",
  "to confirm": "toConfirm",
};

// `[medido]`, `[medido: painel de APM]`, `(Medido)`, `[measured]`…
const markPattern =
  /[[(]\s*(medido|measured|estimado|estimated|sem n[uú]mero|no number|a confirmar|to confirm)\s*(:[^\])]*)?[\])]/gi;

export type MarkMatch = {
  mark: FigureMark;
  from: number;
  to: number;
  text: string;
  note: string;
};

export function findMarks(text: string): MarkMatch[] {
  return [...text.matchAll(markPattern)].map((match) => {
    const word = match[1]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return {
      mark: markWords[word],
      from: match.index,
      to: match.index + match[0].length,
      text: match[0],
      note: match[2] ?? "",
    };
  });
}

export function canonicalMarkText(match: MarkMatch, language: ProfileLanguage) {
  const note = match.note.replace(/^:\s*/, "").trim();
  const word = canonicalMarks[language][match.mark];
  return note ? `[${word}: ${note}]` : `[${word}]`;
}

/** Whether the text holds a figure outside its marks. */
export function hasFigure(text: string) {
  let rest = text;
  for (const match of findMarks(text).reverse()) {
    rest = rest.slice(0, match.from) + rest.slice(match.to);
  }
  return /\d/.test(rest);
}
