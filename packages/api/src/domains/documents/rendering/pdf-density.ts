/**
 * Density steps of the PDF layouts. Step 0 is the specified layout; each
 * next step tightens only vertical spacing (line height, gaps, top and
 * bottom margins), never font sizes or side margins, so a document that
 * runs a few lines over its page limit fits without looking different.
 */
export type DensityStep = 0 | 1 | 2 | 3;

const steps: DensityStep[] = [0, 1, 2, 3];

export const resumeDensity = {
  0: {
    lineHeight: 1.25,
    margin: 28,
    sectionGap: 8,
    titleGap: 3,
    entryGap: 4,
    bulletGap: 1,
  },
  1: {
    lineHeight: 1.21,
    margin: 24,
    sectionGap: 6,
    titleGap: 2.5,
    entryGap: 3,
    bulletGap: 0.75,
  },
  2: {
    lineHeight: 1.18,
    margin: 20,
    sectionGap: 5,
    titleGap: 2,
    entryGap: 2.5,
    bulletGap: 0.5,
  },
  3: {
    lineHeight: 1.15,
    margin: 18,
    sectionGap: 4,
    titleGap: 1.5,
    entryGap: 2,
    bulletGap: 0.25,
  },
} as const;

export const letterDensity = {
  0: { lineHeight: 1.45, margin: 40, bodyGap: 24, paragraphGap: 10 },
  1: { lineHeight: 1.4, margin: 36, bodyGap: 20, paragraphGap: 9 },
  2: { lineHeight: 1.35, margin: 32, bodyGap: 16, paragraphGap: 8 },
  3: { lineHeight: 1.3, margin: 28, bodyGap: 14, paragraphGap: 7 },
} as const;

/**
 * Renders at step 0 and, over `maxPages`, retries each tighter step,
 * returning the first render that fits; when none does, the step 0 one.
 */
export async function renderFitted<
  T extends { pages: number; step: DensityStep },
>(render: (step: DensityStep) => Promise<T>, maxPages: number) {
  const first = await render(0);
  if (first.pages <= maxPages) return first;
  for (const step of steps.slice(1)) {
    const rendered = await render(step);
    if (rendered.pages <= maxPages) return rendered;
  }
  return first;
}
