import type { Line } from "@repo/api/domains/documents/schemas/document";
import type {
  ResumeContent,
  ResumeSection,
} from "@repo/api/domains/documents/schemas/resume-content";

function mapLines(
  content: ResumeContent,
  map: (lines: Line[], owner: string) => Line[]
): ResumeContent {
  return {
    ...content,
    sections: content.sections.map((section): ResumeSection => {
      switch (section.kind) {
        case "summary": {
          const [line] = map([section.line], "summary");
          return line ? { ...section, line } : section;
        }
        case "skills":
          return {
            ...section,
            groups: section.groups.map((group) => {
              const [line] = map([group], "skills");
              return line ? { ...group, text: line.text } : group;
            }),
          };
        case "experience":
          return {
            ...section,
            entries: section.entries.map((entry) => ({
              ...entry,
              lines: map(entry.lines, entry.positionId),
            })),
          };
        case "projects":
          return {
            ...section,
            entries: section.entries.map((entry) => ({
              ...entry,
              lines: map(entry.lines, entry.projectId),
            })),
          };
        default:
          return section;
      }
    }),
  };
}

/** The editor's changes; the server marks changed lines "written by you". */
export function updateLine(
  content: ResumeContent,
  lineId: string,
  text: string
): ResumeContent {
  return mapLines(content, (lines) =>
    lines.map((line) => (line.id === lineId ? { ...line, text } : line))
  );
}

export function removeLine(
  content: ResumeContent,
  lineId: string
): ResumeContent {
  return mapLines(content, (lines, owner) =>
    owner === "summary" || owner === "skills"
      ? lines
      : lines.filter((line) => line.id !== lineId)
  );
}

export function addLine(
  content: ResumeContent,
  ownerId: string,
  id: string
): ResumeContent {
  return mapLines(content, (lines, owner) =>
    owner === ownerId
      ? [...lines, { id, text: "", origin: { kind: "manual" } }]
      : lines
  );
}

export function updateTitleLine(
  content: ResumeContent,
  titleLine: string
): ResumeContent {
  return { ...content, header: { ...content.header, titleLine } };
}
