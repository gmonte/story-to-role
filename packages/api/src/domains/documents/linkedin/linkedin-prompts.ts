import { z } from "zod";

import { bulletFormatRule } from "../writing/bullet-format";
import { draftLine } from "../generation/assemble-resume";
import type { GenerationSettings } from "../schemas/generation-settings";
import { headlineMaxLength } from "../schemas/linkedin-content";

/**
 * What a LinkedIn text is for: the person's career as the profile states
 * it. It stands in for the opening in the coverage review.
 */
export const careerFocus = "Career as the profile states it";

/**
 * What the writing model returns: wording and the evidence behind it,
 * never employers, titles or dates, which code prints.
 */
export const linkedinDraftSchema = z.object({
  // 3 to 5 options; code keeps the grounded ones and chooses the first.
  headlines: z.array(draftLine).catch([]),
  about: z.object({
    // 3 to 4 short paragraphs (`aboutFormatRule`); code joins them with a
    // blank line.
    paragraphs: z.array(z.string()),
    evidence_ids: z.array(z.string()),
  }),
  experience: z.array(
    z.object({ position_id: z.string(), bullets: z.array(draftLine) })
  ),
  // One entry per project, for LinkedIn's Projects section.
  projects: z
    .array(z.object({ project_id: z.string(), bullets: z.array(draftLine) }))
    .catch([]),
  // An education's description, only where profile lines back one.
  education: z
    .array(
      z.object({
        credential_id: z.string(),
        description: draftLine.nullable(),
      })
    )
    .catch([]),
});
export type LinkedinDraft = z.infer<typeof linkedinDraftSchema>;

/**
 * Bullets per experience and project on LinkedIn (resume spec, "LinkedIn"):
 * 3 to 4 whatever its age, fewer only when the profile holds fewer facts.
 */
export const linkedinBullets = { fewest: 3, most: 4 };

/**
 * The settings a LinkedIn text is written and checked by (resume spec,
 * "LinkedIn"): every position, new or old, with LinkedIn's bullet count;
 * a LinkedIn text has no page limit, so the resume's settings don't apply.
 */
export const linkedinSettings = (
  settings: GenerationSettings
): GenerationSettings => ({
  ...settings,
  bulletsRecent: linkedinBullets.most,
  bulletsOlder: linkedinBullets.most,
  veryOld: "keep",
});

/** The purpose block of the writer's material (see `resumeMaterial`). */
export const linkedinPurposeLines = [
  "A LinkedIn profile text with no opening behind it: headline options, the “About” section, for each position its experience text, for each project its text for LinkedIn's Projects section and, where the profile backs one, a short description of an education. It favours no specialty: tell the career as the profile states it, bringing forward each position's strongest points.",
];

/** LinkedIn's limit on the About section, in characters. */
export const aboutMaxLength = 2600;

/**
 * How the About is written (resume spec, "LinkedIn"): what a recruiter
 * scans in 20 seconds and searches by keyword. The text is in English
 * because it goes into prompts: the model writes in the output language.
 */
export const aboutFormatRule = [
  `About format (the about field: 3 to 4 short paragraphs, 150 to 300 words in all, under ${aboutMaxLength.toLocaleString("en-US")} characters, LinkedIn's limit; no bullets, headings or emoji):`,
  "1. Identity, in 1 or 2 sentences: the professional title, the years of experience only when a profile line states them, what the person delivers or the kind of problem they solve, and their main platform or domain. Lead with the value, not a list of tools: at most 2 or 3 top-level technologies or platforms here; the rest goes in the keyword line.",
  "2. Proof, in 1 or 2 paragraphs, the core of the text: each achievement as what the person did (the action and its scope), how or with what, and its impact (a measured result). With two or more meaningful employers, one paragraph per employer, most recent first, naming it as the material prints it: open with the scale of the environment as the profile states it (data volume, pipelines, users, events per day), then the person's own achievements there; the clients or brands the profile names may go in one clause. Early in a career or with a single employer, the 1 or 2 strongest achievements in full, then one sentence summing up other relevant work. Rank achievements by measured impact, then scale, then relevance to the role the profile aims at, then recognizable names; leave out what doesn't pass.",
  "3. Strengths and keywords, in one or two sentences: always a keyword line (“My strongest areas are …”, in the output language) listing 8 to 15 competencies, tools and domains the profile states the person uses, most relevant first, comma-separated: it is what recruiter search matches. Then, where the profile has them: the key certifications by their exact name and code; the career direction the profile states (never naming a competency only studied); one collaboration or client-facing strength backed by a concrete fact.",
  "- In the first person (“I”) throughout, unless the style profile says otherwise.",
  "- Numbers replace adjectives: no self-praise or filler such as “dynamic”, “highly motivated”, “passionate”, “cutting-edge”, “seamlessly”, “perfectly”, “proven track record”, “thrive”, “knows no bounds”, “results-driven”, nor their equivalents in the output language. Where an adjective would sell something, use the figure or the scope that proves it; a strong claim without a measured figure stays without one, never estimated. A figure is written exactly as its profile line shows it.",
  "- evidence_ids lists every profile line (or instruction) the About rests on. With none it is deleted, and so is the whole About when one of its figures isn't shown by a line it cites, or when it names a competency only studied or something the communication rules forbid.",
  "- Before answering, check: every proof sentence has a figure, a scope or a named client or system; no filler; every fact traces to the profile; the identity says what the person delivers, not only which tools they use; the keyword line is there.",
  "- The example below shows the SHAPE only (a different person): never copy its facts, numbers or technologies.",
  "- Example: “I'm a Senior Data Engineer and Cloud Data Architect with 6+ years of experience focused on helping create and support scalable, reliable, and governed data platforms across GCP and Azure.\n\nAt Groupon, I work on petabyte-scale data platforms supporting 2,000+ pipelines, 500+ Airflow/Composer DAGs, and large-scale GCP workloads. My work spans cloud data architecture, orchestration, observability, infrastructure automation, CDP pipelines, and AI-driven remediation. I also helped build Kubernetes-based incident automation processing ~66K task events per day and production AI agents that resolve recurring low-risk KTLO incidents across Airflow, Dataproc, BigQuery, and Keboola.\n\nBefore Groupon, I worked as a Senior Data Engineer at Artefact, delivering cloud data platforms and modernization projects for Heineken, Michelin, Cirque du Soleil, Stanley Black & Decker, and Arca Blanca. My work included migrating 132 legacy Ab Initio pipelines to Azure Databricks, reducing a Heineken profit-sharing process from 2 days to 10 minutes, implementing Treasure Data CDP solutions, and provisioning Azure data platform foundations with Terraform and Terragrunt.\n\nMy strongest areas are Cloud Data Architecture, Data Engineering, Airflow/Composer, GCP, Azure, BigQuery, Dataproc, Databricks, PySpark, Terraform, Kubernetes, CDP, Observability, Incident Automation, and AI Automation.”",
  "- Never like this: an About of personality and tools with no employer, client, figure or achievement (“I'm a highly motivated Software Engineer… my passion for technology knows no bounds… my tech stack revolves around Node.js…”): it could describe thousands of people.",
].join("\n");

export function linkedinPrompt(
  material: string,
  // The profile's education, by id: what an education description names.
  education: Array<{ id: string; title: string; institution: string | null }>
) {
  const bullets = `${linkedinBullets.fewest} to ${linkedinBullets.most}`;
  return [
    "You write a person's LinkedIn text from their career profile, which is the only source of facts: headline options, the About section, each position's experience text, each project's and an education's description. It is read by people, not by a filter: natural, as the person would speak, never a list of keywords (the About's closing keyword line aside).",
    "Rules, enforced by code after you answer:",
    `- headlines: 3 to 5 different options, each at most ${headlineMaxLength} characters: how the person defines themselves professionally, their main area and what they bring, as the profile states it (“Tech Lead | Platform engineering and developer experience”). No hashtags, no emoji, no list of every technology. Each cites in evidence_ids the profile lines it rests on; an option with none, or longer than the limit, is deleted.`,
    "- about: its paragraphs as the About format below asks, one string each.",
    `- experience: every position, new or old, with its key achievements in ${bullets} bullets, fewer only when its profile lines don't hold ${linkedinBullets.fewest} distinct facts; put first the strongest. Each bullet cites, in evidence_ids, lines of its own position only; a bullet without any is deleted.`,
    `- projects: for each project listed in the material (personal or side work, never a position), ${bullets} bullets like a position's, each citing only lines of its own project; code prints the name, dates and link. Never write a project as a position.`,
    aboutFormatRule,
    bulletFormatRule,
    "- A figure appears only when the line it cites shows it; a line carrying any other number is deleted. A result with “[figure withheld]” is told as a qualitative one.",
    `- education: for an education listed below, a description of one or two sentences only when profile lines tell something about it (a thesis, an honour, a project done there), citing them in evidence_ids; otherwise description is null. Never restate the course or the institution: code prints them.${education.length ? "" : " The profile lists no education: return an empty list."}`,
    ...education.map(
      (row) =>
        `  - ${row.id}: ${row.title}${row.institution ? `, ${row.institution}` : ""}`
    ),
    "- Never write employers, titles, institutions or dates in a bullet, a headline or a description: code prints them, as it prints the certifications and languages; only the About names employers. No list of skills outside the About's keyword line, no hashtags.",
    "- Invent nothing: no technology, figure, certification or responsibility the profile doesn't state. Never claim what a position says the person did not do, nor a competency only studied, nor what the communication rules forbid.",
    "",
    material,
  ].join("\n");
}

/** What a section written alone is, for its instruction. */
export type LinkedinSectionWritten =
  | "headline"
  | "about"
  | "experiences"
  | "projects"
  | "educations"
  | "position"
  | "project"
  | "education";

/**
 * What a LinkedIn section written alone asks of the writer (resume spec,
 * "LinkedIn"): a step's section, or one written again, by the same rules.
 */
export function linkedinSectionInstruction(
  section: string,
  kind: LinkedinSectionWritten,
  // The section already had text: the person asked for it again.
  again: boolean
) {
  const what = {
    headline: "the headline options",
    about: "the About section",
    experiences: "the experience text of every position",
    projects: "the text of every project",
    educations:
      "the description of every education listed, where profile lines back one",
    position: `the experience text of the position ${section}`,
    project: `the text of the project ${section}`,
    education: `the description of the education ${section}`,
  }[kind];
  return `Write only ${what}, by the rules above; leave every other field empty.${again ? " The person asked to write it again, so word it differently from a first attempt while keeping to the profile." : ""}`;
}
