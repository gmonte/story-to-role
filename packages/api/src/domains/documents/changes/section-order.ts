import {
  resumeSectionKindSchema,
  type ResumeContent,
  type ResumeSection,
  type ResumeSectionKind,
} from "../schemas/resume-content";

/**
 * The order of a resume's sections is the order of `content.sections`
 * (every snapshot carries it; the header stays first). A document without
 * a moved section keeps the order generation gave it. Every renderer (the
 * editor, the PDF, the plain text) walks that array, so moving a section
 * with its content is only reordering it.
 */

export type SectionPlacement = "above" | "below";

/** A move the agent suggests: `kind` goes above or below `anchor`. */
export type SectionMove = {
  kind: ResumeSectionKind;
  placement: SectionPlacement;
  anchor: ResumeSectionKind;
};

const movePrefix = "section:";

/** The key of the part a move suggestion targets. */
export const sectionMovePart = (kind: ResumeSectionKind) =>
  `${movePrefix}${kind}`;

/** Whether a part key names a section move rather than lines. */
export const isSectionMovePart = (part: string) =>
  part.trim().startsWith(movePrefix);

/** The move a change describes (`replace` reads “above:experience”). */
export function sectionMoveOf(change: {
  part: string;
  replace: string;
}): SectionMove | null {
  const part = change.part.trim();
  if (!part.startsWith(movePrefix)) return null;
  const kind = resumeSectionKindSchema.safeParse(part.slice(movePrefix.length));
  const [placement, name] = change.replace.trim().split(":");
  const anchor = resumeSectionKindSchema.safeParse(name);
  if (
    !kind.success ||
    !anchor.success ||
    (placement !== "above" && placement !== "below")
  ) {
    return null;
  }
  return { kind: kind.data, placement, anchor: anchor.data };
}

/** The text a move suggestion stores in `replace`. */
export const sectionMoveText = (move: SectionMove) =>
  `${move.placement}:${move.anchor}`;

/**
 * The sections with `kind` taken out and put right above or below
 * `anchor`, or null when either is not printed, they are the same, or the
 * section already sits there.
 */
export function moveSectionNextTo<T extends { kind: ResumeSectionKind }>(
  sections: T[],
  move: SectionMove
): T[] | null {
  if (move.kind === move.anchor) return null;
  const moving = sections.find((section) => section.kind === move.kind);
  if (!moving || !sections.some((section) => section.kind === move.anchor)) {
    return null;
  }
  const rest = sections.filter((section) => section.kind !== move.kind);
  const at =
    rest.findIndex((section) => section.kind === move.anchor) +
    (move.placement === "below" ? 1 : 0);
  const next = [...rest.slice(0, at), moving, ...rest.slice(at)];
  return next.every((section, index) => section === sections[index])
    ? null
    : next;
}

/** The content with the suggested move written, or null when it can't be. */
export function applySectionMove(
  content: ResumeContent,
  move: SectionMove
): ResumeContent | null {
  const sections = moveSectionNextTo<ResumeSection>(content.sections, move);
  return sections && { ...content, sections };
}

/** The sections in the order of `kinds`; those it doesn't name keep theirs, after. */
export function sectionsInOrder<T extends { kind: ResumeSectionKind }>(
  sections: T[],
  kinds: ResumeSectionKind[]
): T[] {
  const rank = (section: T) => {
    const at = kinds.indexOf(section.kind);
    return at < 0 ? kinds.length : at;
  };
  return sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => rank(a.section) - rank(b.section) || a.index - b.index)
    .map(({ section }) => section);
}
