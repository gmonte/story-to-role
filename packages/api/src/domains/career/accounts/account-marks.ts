/** Where a figure in an account comes from, as its highlighter mark says. */
export type FigureOrigin =
  | "measured"
  | "estimated"
  | "no_number"
  | "to_confirm";

/** How a figure is highlighted: by its origin, or as one with none said. */
export type FigureHighlight = FigureOrigin | "unmarked";

/** One stretch of an account, plain or highlighted. */
export type AccountSegment =
  | { text: string }
  | { text: string; mark: FigureOrigin }
  | { text: string; figure: FigureHighlight };

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
// optional unit or multiplier ("40%", "R$ 1.5 mil", "2 million").
const figurePattern =
  /(?:R\$|US\$|\$|€)?\s?\d+(?:[.,]\d+)*(?:\s?(?:%|k|K|M|x|h|min|mil|bi|million|millions|thousand|billion|milhão|milhões|bilhão|bilhões))?(?![\p{L}\d])/gu;
// A bare year ("In 2021") is a date, not a figure to mark.
const bareYear = /^(?:19|20)\d{2}$/;
// Where a mark's reach ends: the end of a sentence, a comma, a semicolon,
// or a conjunction joining two claims ("led 6 engineers and cut 40%").
const clauseEnd = /[.!?;,](?=\s|$)|\n|\s(?:and|but|e|mas|while|enquanto)\s/gi;

/**
 * Splits an account into the stretches the space highlights: each mark, and
 * each figure with the origin of the first mark after it in the same clause,
 * or "unmarked" when that clause has none.
 */
export function highlightAccount(text: string): AccountSegment[] {
  const marks = [...text.matchAll(markPattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    origin: markWords[match[1].toLowerCase()],
  }));
  const ends = [...text.matchAll(clauseEnd)].map((match) => match.index);
  const insideMark = (at: number) =>
    marks.some((mark) => at >= mark.start && at < mark.end);
  const figures = [...text.matchAll(figurePattern)]
    .filter(
      (match) => !insideMark(match.index) && !bareYear.test(match[0].trim())
    )
    .map((match) => {
      const start =
        match.index + (match[0].length - match[0].trimStart().length);
      const end = match.index + match[0].length;
      const clauseStop = ends.find((at) => at >= end) ?? text.length;
      const mark = marks.find(
        (candidate) => candidate.start >= end && candidate.start < clauseStop
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
