import { mentions } from "@repo/api/domains/profile/truth/lint";

/** What the profile itself says the person lacks. */
export type DeclaredLacks = {
  // Competencies listed as studied, without professional experience.
  studied: string[];
  // The known gaps, each as written.
  gaps: string[];
  // What the person did not do, per position, each as written.
  notDone: string[];
};

// A requirement is a sentence; only a short term names one thing.
const maxNameWords = 4;
// And only a short line says one thing is lacking: a longer one may only
// mention the word ("never led a team of more than 5 Python developers").
const maxClauseWords = 6;
// "React or Vue" asks for either: one being lacking is not a gap.
const alternatives = /(^|\s)(or|ou)(\s|$)|\//i;

const countWords = (text: string) => text.trim().split(/\s+/).length;

/** Whether a short clause of the line names the term. */
function namedIn(line: string, name: string) {
  return line
    .replace(/\([^)]*\)/g, "")
    .split(/[;.]/)
    .some(
      (clause) =>
        clause.trim() &&
        countWords(clause) <= maxClauseWords &&
        mentions(clause, name)
    );
}

/**
 * Whether the profile plainly declares that the person lacks what an
 * opening's term names: a competency only studied, or a short known-gap or
 * did-not-do line naming it. Such a term is a gap, never coverage (resume
 * spec, "Flow"), whatever a model makes of the passages. Returns the line
 * that says so. Anything less plain (a sentence-long requirement, a long
 * line, "a or b") is left to the judge, which points at the line.
 */
export function declaredLack(term: string, lacks: DeclaredLacks) {
  const name = term.trim();
  if (!name || countWords(name) > maxNameWords || alternatives.test(name)) {
    return null;
  }
  // The term names the competency ("Apache Spark" for "Spark"), never the
  // other way round: "React" is not "React Native".
  const studied = lacks.studied.find((competency) =>
    mentions(name, competency)
  );
  if (studied) return { kind: "studied" as const, text: studied };
  const gap = lacks.gaps.find((line) => namedIn(line, name));
  if (gap) return { kind: "gap" as const, text: gap };
  const notDone = lacks.notDone.find((line) => namedIn(line, name));
  return notDone ? { kind: "notDone" as const, text: notDone } : null;
}
