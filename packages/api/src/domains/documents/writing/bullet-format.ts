import type { OutputLanguage } from "../schemas/document";

/**
 * The product's universal bullet format: the same for every user, never
 * shown in the interface, edited only here. Every resume bullet (an
 * experience's or a project's) and every LinkedIn experience or project
 * bullet follows it; the cover letter (prose) and the profile (the raw
 * truth) do not. The text is in English because it goes into prompts: the
 * model writes in the document's output language.
 */
export const bulletFormatRule = [
  "Bullet format (every experience and project bullet, in one sentence or two, in this order):",
  "1. Action: what the person did, with a strong action verb in the past tense and the first person implicit (never “I”, never “Responsible for”).",
  "2. Impact/result: what changed because of it. A figure only when the profile line shows it as measured; otherwise a qualitative result the profile states. Never an invented or unmarked figure. When the profile states no result, say what the work enabled, still inventing nothing.",
  "3. How / with what: the means and keywords, such as methods, architecture and technologies the profile states, preferring the opening's keywords where true of the person, spelled as the opening spells them.",
  "A bullet is never a bare list of technologies and fits about two to three lines of a PDF (roughly 330 characters).",
  "The three blocks may also flow in one sentence, or the how may be a separate sentence after the result, or the action may carry its purpose before the result (action, result, then “using/with …”), and the how may name methods and practices, not only technologies.",
  "The examples below show the SHAPE only: never copy their facts, numbers or technologies into a document.",
  "- Example: “Redesigned the application architecture following Clean Architecture and Domain-Driven Design (DDD), optimizing the main section responsible for extracting relevant emails and carbon emissions data. Reduced the average processing time from 15 minutes to just 3 minutes by utilizing Node.js, TypeScript, and various AWS services such as AWS DynamoDB, AWS Cognito, AWS API Gateway, and AWS SQS.”",
  "- Example: “Implemented test coverage for the application, covering 60% of the codebase with unit and integration tests. This effort led to a noticeable decrease in production bugs and significantly improved scalability. Used Jest and TypeScript for efficient testing.”",
  "- Example: “Designed and built a notification system from scratch, adhering to the principles of Clean Architecture. The system efficiently handles multiple mobile devices connected to a single account, leveraging AWS SNS, AWS DynamoDB, and AWS Lambda with Node.js and TypeScript.”",
  "- Example: “Implemented an end-to-end timeseries telemetry ingestion system capable of processing highly concurrent real-time requests from multiple vendors, delivering results in under 3 seconds using AWS Lambda, API Gateway, SQS, DynamoDB, and feature flags via Flagsmith.”",
  "- Example: “Built database interaction layers leveraging Sequelize ORM and automated infrastructure deployment with Terraform, ensuring scalable, maintainable, and reproducible environments.”",
  "- Example: “Architected and delivered two E2E data ingestion pipelines handling telemetry from 8M+ system devices on both daily and monthly schedules, enabling reliable downstream processing for analytics and reporting. Used BullMQ to build a QMS to improve delivery time.”",
  "- Example: “Developed backfill strategies to synchronize historical datasets from APIs with strict 7-day data retrieval limits, achieving ingestion of up to 3 years of data in under 12 hours while adhering to vendor rate limits.”",
  "- Example: “Implemented GCP Cloud Functions to feed vendor-specific DAG pipelines, removing obsolete writes to unused legacy tables, resulting in cloud cost reductions and improved operational efficiency.”",
  "- Example: “Delivered infrastructure-as-code solutions in Terraform and application logic in Node.js and TypeScript to standardize deployments and streamline cross-cloud workflows.”",
  "- Example: “Onboarded and mentored new engineers in AWS and GCP data ingestion pipelines, providing documentation, technical sessions, and system walkthroughs to accelerate team ramp-up and reduce knowledge gaps.”",
  "- Example: “Developed a significant API route adhering to RESTful API standards. This route facilitates the creation of generic datasets based on data categories provided by sellers, along with internal system attributes that categorically sell the data, allowing the possibility of data selling to 900.000 users.”",
  "- Example: “Implemented custom data payload cron jobs to meet the requirements of global companies, accelerating product delivery to high-demand customers. Executed scripts through AWS EC2 instances with pre-defined AWS AMI images, and integrated with Jenkins for efficient CI/CD.”",
  "- Example: “Created an internal reporting system to address the issue on routine daily/weekly activities of the Product/Partner Success team. This system efficiently extracts data from AWS S3 using Apache Spark, combining it with data from PostgreSQL tables and results on spreadsheets with data visualization optimizing their decisions on the next steps.”",
  "- Example: “Successfully managed the migration of legacy system data to a new format, adhering to predefined data rules and formats. Accomplished the transfer using Scala, Scala Cats, Apache Spark, AWS EC2, and AWS S3.”",
].join("\n");

/** A bullet's shape problems code can tell (a warning, never a block). */
export type BulletShapeProblem = "techList" | "tooLong" | "opening";

/** About three lines of a PDF. */
export const bulletMaxLength = 330;

const nonVerbOpeners: Record<OutputLanguage, string[]> = {
  "en-US": [
    "responsible",
    "responsibility",
    "responsibilities",
    "the",
    "a",
    "an",
    "my",
    "our",
    "various",
    "several",
    "many",
    "experience",
    "work",
    "worked",
    "knowledge",
    "ownership",
    "duties",
    "in",
    "on",
    "with",
    "for",
    "as",
  ],
  "pt-BR": [
    "responsável",
    "responsavel",
    "responsabilidade",
    "responsabilidades",
    "o",
    "a",
    "os",
    "as",
    "um",
    "uma",
    "meu",
    "minha",
    "diversos",
    "diversas",
    "vários",
    "várias",
    "experiência",
    "experiencia",
    "trabalho",
    "conhecimento",
    "atuação",
    "atuacao",
    "em",
    "no",
    "na",
    "com",
    "para",
    "como",
  ],
};

const nounSuffixes: Record<OutputLanguage, RegExp> = {
  "en-US": /(tion|sion|ment|ness|ity|ship)s?$/,
  "pt-BR": /(ção|ções|mento|mentos|dade|dades|agem|agens)$/,
};

const firstWord = (text: string) =>
  text
    .trim()
    .replace(/^[^\p{L}]+/u, "")
    .split(/[\s,;:]+/)[0]
    ?.toLowerCase() ?? "";

/**
 * What code can tell of a bullet's shape, leniently: it is not a bare list
 * of technologies, it fits about three PDF lines, and it opens with a verb
 * rather than “Responsible for” or a noun phrase. An empty result means no
 * problem found, not that the bullet follows the format.
 */
export function checkBulletShape(
  text: string,
  language: OutputLanguage
): BulletShapeProblem[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const problems: BulletShapeProblem[] = [];

  const words = trimmed.split(/\s+/);
  const items = trimmed
    .replace(/^[^:]{0,30}:\s*/, "")
    .replace(/\.$/, "")
    .split(/\s*(?:,|;|\/|\|)\s*/);
  if (
    items.length >= 3 &&
    words.length <= 16 &&
    items.every((item) => item.split(/\s+/).length <= 3) &&
    !/[.!?]\s/.test(trimmed)
  ) {
    problems.push("techList");
  }

  if (trimmed.length > bulletMaxLength) problems.push("tooLong");

  const first = firstWord(trimmed);
  if (
    first &&
    (nonVerbOpeners[language].includes(first) ||
      nounSuffixes[language].test(first))
  ) {
    problems.push("opening");
  }
  return problems;
}
