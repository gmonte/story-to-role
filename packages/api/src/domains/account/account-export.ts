import { strToU8, Zip, ZipDeflate } from "fflate";

import {
  getUserCipher,
  type UserCipher,
} from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";
import type { Storage } from "@repo/api/tools/storage/storage";

import { AccountRepository } from "./account-repository";

type Row = Record<string, unknown>;

/** Where each table goes in the ZIP. */
export const exportPaths: Record<string, string> = {
  career_profiles: "career/profile",
  positions: "career/positions",
  position_conflicts: "career/position-conflicts",
  projects: "career/projects",
  position_summaries: "career/position-summaries",
  cross_notes: "career/cross-notes",
  credentials: "career/credentials",
  career_narratives: "career/narratives",
  timeline_proposals: "career/timeline-proposals",
  career_goals: "career/goals",
  source_documents: "career/imported-files",
  evidence: "evidence/evidence",
  stories: "evidence/stories",
  skills: "evidence/skills",
  sensitive_items: "evidence/sensitive-items",
  interview_sessions: "interview/sessions",
  interview_turns: "interview/turns",
  draft_facts: "interview/draft-facts",
  draft_sensitive_items: "interview/draft-sensitive-items",
  openings: "openings/openings",
  opening_terms: "openings/terms",
  fit_checks: "openings/fit-checks",
  fit_check_items: "openings/fit-check-items",
  applications: "applications/applications",
  application_events: "applications/events",
  application_submissions: "applications/submissions",
  tracker_settings: "applications/tracker-settings",
  dismissed_reminders: "applications/dismissed-reminders",
  application_instructions: "applications/instructions",
  instruction_points: "applications/instruction-points",
  locked_fact_overrides: "applications/locked-fact-overrides",
  application_overrides: "applications/sensitive-item-overrides",
  company_research: "applications/company-research",
  company_facts: "applications/company-facts",
  motivation_interviews: "applications/motivation-interviews",
  motivation_turns: "applications/motivation-turns",
  motivation_points: "applications/motivation-points",
  documents: "documents/documents",
  document_versions: "documents/versions",
  document_snapshots: "documents/snapshots",
  generations: "documents/generations",
  review_rounds: "documents/review-rounds",
  position_title_equivalents: "documents/title-equivalents",
  rendered_files: "documents/rendered-files",
  resume_templates: "documents/resume-template",
  style_profiles: "documents/style-profile",
  chat_messages: "chat/messages",
  tasks: "activity/tasks",
  ai_usage: "billing/ai-usage",
  ai_keys: "billing/own-api-key",
  credit_lots: "billing/credit-lots",
  credit_entries: "billing/credit-entries",
  courtesy_grants: "billing/courtesy-grants",
  stored_credit_confirmations: "billing/stored-credit-confirmations",
  billing_customers: "billing/stripe-customer",
  subscriptions: "billing/subscriptions",
};

// Never exported: vectors are derived, keys are secrets, and who granted a
// courtesy plan is another person's id.
const leftOut = new Set([
  "embedding",
  "encryptedKey",
  "wrappedKey",
  "grantedBy",
]);

const lowerFirst = (text: string) =>
  text.charAt(0).toLowerCase() + text.slice(1);

/** A stored structure (a snapshot's content) comes back as JSON. */
function parsed(text: string): unknown {
  if (!/^[[{]/.test(text)) return text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * A row as the user reads it: every `encryptedX` column decrypted to `x`,
 * vectors and secrets left out.
 */
function readable(cipher: UserCipher, row: Row) {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (leftOut.has(key)) continue;
    if (key.startsWith("encrypted")) {
      out[lowerFirst(key.slice("encrypted".length))] =
        typeof value === "string" ? parsed(cipher.decrypt(value)) : value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** A name that never makes a path inside the ZIP. */
const safeName = (text: string) => text.replace(/[/\\\\:*?"<>|]/g, "_");

/**
 * The user's whole account as a ZIP stream (privacy spec, "Export"): every
 * table they own as JSON, the rendered PDFs and the files they imported.
 * Streamed, so an account's size never meets a response limit.
 */
export async function streamAccountExport(deps: {
  db: DbClient;
  storage: Storage;
  userId: string;
}) {
  const repository = new AccountRepository(deps.db);
  const cipher = await getUserCipher(deps.db, deps.userId);
  const user = await repository.findUser(deps.userId);
  const rows = await repository.ownedRows(deps.userId);

  // Stored files are encrypted like everything else: decrypted one by one.
  const readFile = async (storageKey: unknown) => {
    const stored = await deps.storage.get(String(storageKey));
    return stored
      ? new Uint8Array(
          Buffer.from(cipher.decrypt(stored.toString("utf8")), "base64")
        )
      : null;
  };
  // A PDF named by what it is: document, language, change and template.
  const pdfName = (file: Row) => {
    const snapshot = rows.document_snapshots.find(
      (row) => row.id === file.snapshotId
    );
    const version = rows.document_versions.find(
      (row) => row.id === snapshot?.versionId
    );
    const document = rows.documents.find(
      (row) => row.id === version?.documentId
    );
    const text = (value: unknown) =>
      typeof value === "string" || typeof value === "number"
        ? String(value)
        : "";
    return safeName(
      [
        text(document?.kind) || "document",
        text(version?.language),
        `change-${text(snapshot?.sequence)}`,
        text(file.template),
        text(file.snapshotId).slice(0, 8),
      ]
        .filter(Boolean)
        .join("_")
    );
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((error, chunk, final) => {
        if (error) return controller.error(error);
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      const add = (name: string, data: Uint8Array) => {
        const entry = new ZipDeflate(name, { level: 6 });
        zip.add(entry);
        entry.push(data, true);
      };
      try {
        add(
          "account.json",
          strToU8(
            JSON.stringify(
              {
                exportedAt: new Date(),
                email: user?.email,
                firstName: user?.firstName,
                lastName: user?.lastName,
                createdAt: user?.createdAt,
              },
              null,
              2
            )
          )
        );
        for (const [table, path] of Object.entries(exportPaths)) {
          add(
            `${path}.json`,
            strToU8(
              JSON.stringify(
                (rows[table] ?? []).map((row) => readable(cipher, row)),
                null,
                2
              )
            )
          );
        }
        for (const file of rows.rendered_files) {
          const bytes = await readFile(file.storageKey);
          if (bytes) add(`pdfs/${pdfName(file)}.pdf`, bytes);
        }
        for (const document of rows.source_documents) {
          const bytes = await readFile(document.storageKey);
          const name =
            typeof document.encryptedFileName === "string"
              ? cipher.decrypt(document.encryptedFileName)
              : "file";
          if (bytes) {
            add(
              `imported-files/${String(document.id).slice(0, 8)}_${safeName(name)}`,
              bytes
            );
          }
        }
        zip.end();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

export const exportFileName = (now = new Date()) =>
  `StoryToRole_export_${now.toISOString().slice(0, 10)}.zip`;
