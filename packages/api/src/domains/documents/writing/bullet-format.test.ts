import { describe, expect, it } from "vitest";

import {
  adjusterPrompt,
  editorPrompt,
  reviewerPrompt,
  strategistPrompt,
} from "../generation/resume-prompts";
import { linkedinPrompt } from "../linkedin/linkedin-prompts";
import { defaultGenerationSettings } from "../schemas/generation-settings";
import { bulletFormatRule, checkBulletShape } from "./bullet-format";

describe("checkBulletShape", () => {
  it("accepts well-shaped bullets in both languages", () => {
    expect(
      checkBulletShape(
        "Redesigned the billing service, cutting processing time by half, using Node.js and Postgres.",
        "en-US"
      )
    ).toEqual([]);
    expect(
      checkBulletShape(
        "Implementei a fila de notificações, reduzindo os atrasos, com Node.js e AWS SQS.",
        "pt-BR"
      )
    ).toEqual([]);
  });

  it("accepts the owner's example bullets", () => {
    const examples = [
      "Implemented an end-to-end timeseries telemetry ingestion system capable of processing highly concurrent real-time requests from multiple vendors, delivering results in under 3 seconds using AWS Lambda, API Gateway, SQS, DynamoDB, and feature flags via Flagsmith.",
      "Built database interaction layers leveraging Sequelize ORM and automated infrastructure deployment with Terraform, ensuring scalable, maintainable, and reproducible environments.",
      "Architected and delivered two E2E data ingestion pipelines handling telemetry from 8M+ system devices on both daily and monthly schedules, enabling reliable downstream processing for analytics and reporting. Used BullMQ to build a QMS to improve delivery time.",
      "Developed backfill strategies to synchronize historical datasets from APIs with strict 7-day data retrieval limits, achieving ingestion of up to 3 years of data in under 12 hours while adhering to vendor rate limits.",
      "Implemented GCP Cloud Functions to feed vendor-specific DAG pipelines, removing obsolete writes to unused legacy tables, resulting in cloud cost reductions and improved operational efficiency.",
      "Delivered infrastructure-as-code solutions in Terraform and application logic in Node.js and TypeScript to standardize deployments and streamline cross-cloud workflows.",
      "Onboarded and mentored new engineers in AWS and GCP data ingestion pipelines, providing documentation, technical sessions, and system walkthroughs to accelerate team ramp-up and reduce knowledge gaps.",
      "Developed a significant API route adhering to RESTful API standards. This route facilitates the creation of generic datasets based on data categories provided by sellers, along with internal system attributes that categorically sell the data, allowing the possibility of data selling to 900.000 users.",
      "Implemented custom data payload cron jobs to meet the requirements of global companies, accelerating product delivery to high-demand customers. Executed scripts through AWS EC2 instances with pre-defined AWS AMI images, and integrated with Jenkins for efficient CI/CD.",
      "Created an internal reporting system to address the issue on routine daily/weekly activities of the Product/Partner Success team. This system efficiently extracts data from AWS S3 using Apache Spark, combining it with data from PostgreSQL tables and results on spreadsheets with data visualization optimizing their decisions on the next steps.",
      "Successfully managed the migration of legacy system data to a new format, adhering to predefined data rules and formats. Accomplished the transfer using Scala, Scala Cats, Apache Spark, AWS EC2, and AWS S3.",
    ];
    for (const example of examples)
      expect(checkBulletShape(example, "en-US")).toEqual([]);
  });

  it("flags a bare list of technologies", () => {
    expect(
      checkBulletShape("React, Node.js, Postgres, AWS", "en-US")
    ).toContain("techList");
    expect(
      checkBulletShape("Tecnologias: React, Node.js, AWS", "pt-BR")
    ).toContain("techList");
  });

  it("flags a bullet over three lines", () => {
    expect(
      checkBulletShape(`Built ${"a very long thing ".repeat(25)}.`, "en-US")
    ).toContain("tooLong");
  });

  it("flags openings that aren't an action", () => {
    expect(
      checkBulletShape("Responsible for the billing service.", "en-US")
    ).toContain("opening");
    expect(
      checkBulletShape("Responsável por manter o serviço de cobrança.", "pt-BR")
    ).toContain("opening");
    expect(checkBulletShape("Development of the API.", "en-US")).toContain(
      "opening"
    );
    expect(
      checkBulletShape("Desenvolvimento da API de cobrança.", "pt-BR")
    ).toContain("opening");
  });
});

describe("prompts", () => {
  const settings = defaultGenerationSettings;
  const resume = { kind: "resume", header: {}, sections: [] } as never;
  it("carry the bullet format", () => {
    const prompts = [
      strategistPrompt("m", settings),
      reviewerPrompt({ material: "m", resume: "r", pages: 1, maxPages: 2 }),
      editorPrompt({
        material: "m",
        settings,
        draft: {} as never,
        advice: [],
        inconsistencies: [],
        dropped: [],
        forbiddenLines: [],
        pages: 1,
      }),
      adjusterPrompt({ material: "m", settings, reference: resume }),
      linkedinPrompt("m", settings),
    ];
    for (const prompt of prompts) expect(prompt).toContain(bulletFormatRule);
  });
});
