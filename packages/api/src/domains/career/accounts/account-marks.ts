/** Where a figure in an account comes from, as its highlighter mark says. */
export type FigureOrigin =
  | "measured"
  | "estimated"
  | "no_number"
  | "to_confirm";

/** One stretch of an account, plain or highlighted. */
export type AccountSegment =
  | { text: string }
  | { text: string; mark: FigureOrigin }
  | { text: string; figure: FigureOrigin | "unmarked" };

// The marks of the meu-emprego-novo method, in Portuguese and English.
const markWords: Record<string, FigureOrigin> = {
  medido: "measured",
  measured: "measured",
  estimado: "estimated",
  estimated: "estimated",
  "sem número": "no_number",
  "sem numero": "no_number",
  "no number": "no_number",
  "a confirmar": "to_confirm",
  "to confirm": "to_confirm",
};

const markPattern = new RegExp(
  `\\[(${Object.keys(markWords).join("|")})\\]`,
  "gi"
);
// A figure: an optional currency, digits with their separators, an
// optional unit or multiplier.
const figurePattern =
  /(?:R\$|US\$|\$|€)?\s?\d+(?:[.,]\d+)*(?:\s?(?:%|k|K|M|mil|bi|x|h|min))?(?![\p{L}\d])/gu;
// Where a sentence ends: a figure's mark is the first one before it.
const sentenceEnd = /[.!?;](?=\s|$)|\n/g;

/**
 * Splits an account into the stretches the space highlights: each mark, and
 * each figure with the origin of the first mark after it in the same
 * sentence, or "unmarked" when that sentence has none.
 */
export function highlightAccount(text: string): AccountSegment[] {
  const marks = [...text.matchAll(markPattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    origin: markWords[match[1].toLowerCase()],
  }));
  const ends = [...text.matchAll(sentenceEnd)].map((match) => match.index);
  const insideMark = (at: number) =>
    marks.some((mark) => at >= mark.start && at < mark.end);
  const figures = [...text.matchAll(figurePattern)]
    .filter((match) => !insideMark(match.index))
    .map((match) => {
      const start =
        match.index + (match[0].length - match[0].trimStart().length);
      const end = match.index + match[0].length;
      const sentenceStop = ends.find((at) => at >= end) ?? text.length;
      const mark = marks.find(
        (candidate) => candidate.start >= end && candidate.start < sentenceStop
      );
      return { start, end, origin: mark?.origin ?? ("unmarked" as const) };
    });

  const stretches = [
    ...marks.map((mark) => ({ ...mark, kind: "mark" as const })),
    ...figures.map((figure) => ({ ...figure, kind: "figure" as const })),
  ].sort((a, b) => a.start - b.start);

  const segments: AccountSegment[] = [];
  let at = 0;
  for (const stretch of stretches) {
    if (stretch.start > at)
      segments.push({ text: text.slice(at, stretch.start) });
    const slice = text.slice(stretch.start, stretch.end);
    segments.push(
      stretch.kind === "mark"
        ? { text: slice, mark: stretch.origin }
        : { text: slice, figure: stretch.origin }
    );
    at = stretch.end;
  }
  if (at < text.length) segments.push({ text: text.slice(at) });
  return segments;
}
