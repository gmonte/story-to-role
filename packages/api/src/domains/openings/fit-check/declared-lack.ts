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

/**
 * Whether the profile declares that the person lacks what an opening's
 * term names: a competency only studied, a known gap, or something they
 * did not do. Such a term is a gap, never coverage (resume spec, "Flow"),
 * whatever a model makes of the passages. Returns the line that says so.
 */
export function declaredLack(term: string, lacks: DeclaredLacks) {
  const name = term.trim();
  if (!name || name.split(/\s+/).length > maxNameWords) return null;
  const studied = lacks.studied.find(
    (competency) => mentions(name, competency) || mentions(competency, name)
  );
  if (studied) return { kind: "studied" as const, text: studied };
  const gap = lacks.gaps.find((line) => mentions(line, name));
  if (gap) return { kind: "gap" as const, text: gap };
  const notDone = lacks.notDone.find((line) => mentions(line, name));
  return notDone ? { kind: "notDone" as const, text: notDone } : null;
}
