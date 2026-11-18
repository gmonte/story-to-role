/**
 * Density steps of the PDF layouts. Step 0 is the specified layout; each
 * next step tightens only vertical spacing (line height, gaps, top and
 * bottom margins), never font sizes or side margins, so a document that
 * runs a few lines over its page limit fits without looking different.
 * The steps are small and many: a document one line over takes the step
 * that just fits, not one that leaves half a page empty.
 */
export type DensityStep = number;

/** The tightest step; steps go from 0 to it, evenly. */
export const maxDensityStep = 10;

type Spacing = Record<string, number>;

/** The spacing `step` tenths of the way from `loose` to `tight`. */
function between<T extends Spacing>(loose: T, tight: T, step: DensityStep) {
  const t = Math.min(Math.max(step, 0), maxDensityStep) / maxDensityStep;
  return Object.fromEntries(
    Object.entries(loose).map(([key, value]) => [
      key,
      Math.round((value + ((tight[key] ?? value) - value) * t) * 1000) / 1000,
    ])
  ) as T;
}

const resumeLoose = {
  lineHeight: 1.25,
  margin: 28,
  sectionGap: 8,
  titleGap: 3,
  entryGap: 4,
  bulletGap: 1,
};
const resumeTight = {
  lineHeight: 1.15,
  margin: 18,
  sectionGap: 4,
  titleGap: 1.5,
  entryGap: 2,
  bulletGap: 0.25,
};

export const resumeDensity = (step: DensityStep) =>
  between(resumeLoose, resumeTight, step);

const letterLoose = {
  lineHeight: 1.45,
  margin: 40,
  bodyGap: 24,
  paragraphGap: 10,
};
const letterTight = {
  lineHeight: 1.3,
  margin: 28,
  bodyGap: 14,
  paragraphGap: 7,
};

export const letterDensity = (step: DensityStep) =>
  between(letterLoose, letterTight, step);

/**
 * Renders at step 0 and, over `maxPages`, finds the loosest step that fits
 * (pages only fall as steps tighten, so a binary search over the steps);
 * when even the tightest doesn't fit, the step 0 render.
 */
export async function renderFitted<
  T extends { pages: number; step: DensityStep },
>(render: (step: DensityStep) => Promise<T>, maxPages: number) {
  const first = await render(0);
  if (first.pages <= maxPages) return first;
  let fits = await render(maxDensityStep);
  if (fits.pages > maxPages) return first;
  let low = 0;
  let high = maxDensityStep;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    const rendered = await render(middle);
    if (rendered.pages <= maxPages) {
      fits = rendered;
      high = middle;
    } else {
      low = middle;
    }
  }
  return fits;
}
