import type { AiFunding } from "@repo/api/domains/ai/ai-funding";
import type { AiUsage } from "@repo/api/domains/ai/providers/provider-package";
import type {
  DocumentKind,
  GenerationKind,
} from "@repo/api/domains/documents/schemas/document";
import type {
  TaskStatus,
  TaskType,
} from "@repo/api/domains/tasks/schemas/task";

import { creditsForUsage, usdForUsage } from "./credit-pricing";
import type {
  PlatformUsage,
  PlatformUsageUser,
  UsageOperation,
  UsageOperationRow,
  UsagePayer,
  UsageStatement,
} from "./schemas/usage-statement";

export type UsageCall = AiUsage & {
  callId: string;
  userId: string;
  createdAt: Date;
  purpose: string;
  funding: AiFunding;
  taskId: string | null;
  taskType: TaskType | null;
  taskStatus: TaskStatus | null;
  documentKind: DocumentKind | null;
  generationKind: GenerationKind | null;
};

type Tokens = Pick<
  AiUsage,
  "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens"
>;

const sumTokens = (rows: Tokens[]): Tokens => ({
  inputTokens: rows.reduce((total, row) => total + row.inputTokens, 0),
  outputTokens: rows.reduce((total, row) => total + row.outputTokens, 0),
  cacheReadTokens: rows.reduce((total, row) => total + row.cacheReadTokens, 0),
  cacheWriteTokens: rows.reduce(
    (total, row) => total + row.cacheWriteTokens,
    0
  ),
});

const oneDecimal = (value: number) => Math.round(value * 10) / 10;

/**
 * `total` shared by `weights`, in tenths that add up to it exactly: each
 * part rounded down, the tenths left over going to the largest remainders.
 */
function shareInTenths(total: number, weights: number[]) {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((weight) => (total * 10 * weight) / sum);
  const parts = exact.map(Math.floor);
  let left =
    Math.round(total * 10) - parts.reduce((acc, part) => acc + part, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - parts[index] }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const { index } of byRemainder) {
    if (left <= 0) break;
    parts[index] += 1;
    left -= 1;
  }
  return parts.map((part) => part / 10);
}
const roundUsd = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * The operations of the usage statement (billing spec, "Usage statement"):
 * one per finished task, and one per call made outside any task, newest
 * first. An operation is paid by the user's key when its calls were; else
 * by the user's credits when it debited any, its credits being what it
 * debited; else by StoryToRole, without charging them. What did not come
 * out of the user's credits shows its credit equivalent. Unless the
 * deployment shows the platform's cost, StoryToRole's operations are left
 * out and US$ is shown only for the user's key, since it would reveal the
 * margin.
 */
function buildOperations(input: {
  calls: UsageCall[];
  debitedByTask: Map<string, number>;
  showsPlatformCost: boolean;
}) {
  const groups = new Map<string, UsageCall[]>();
  for (const call of input.calls) {
    // Running tasks are listed once they finish and settle.
    if (call.taskId && !isFinished(call.taskStatus)) continue;
    const key = call.taskId ?? call.callId;
    groups.set(key, [...(groups.get(key) ?? []), call]);
  }

  return [...groups.entries()]
    .map(([operationId, calls]) => {
      const first = calls[0];
      const payer = payerOf(calls, input.debitedByTask.get(operationId));
      const credits =
        payer === "credits"
          ? input.debitedByTask.get(operationId)!
          : creditsForUsage(calls);
      const usd = usdForUsage(calls);
      const showsUsd = input.showsPlatformCost || payer === "key";
      // The costliest model first.
      const ofModels = [...new Set(calls.map((call) => call.model))]
        .map((model) => calls.filter((call) => call.model === model))
        .sort((a, b) => usdForUsage(b) - usdForUsage(a));
      const shares = shareInTenths(
        credits,
        ofModels.map((ofModel) => usdForUsage(ofModel))
      );
      const models = ofModels.map((ofModel, index) => ({
        model: ofModel[0].model,
        ...sumTokens(ofModel),
        credits: shares[index],
        usd: showsUsd ? roundUsd(usdForUsage(ofModel)) : null,
      }));
      return {
        operationId,
        userId: first.userId,
        operation: operationOf(first),
        // Its last call: the window is about when calls were made.
        at: calls[calls.length - 1].createdAt,
        status:
          first.taskStatus === "failed"
            ? ("failed" as const)
            : ("completed" as const),
        payer,
        ...sumTokens(calls),
        credits,
        usd: showsUsd ? roundUsd(usd) : null,
        models,
        // Kept to total US$ by payer without rounding twice.
        rawUsd: usd,
      };
    })
    .filter(
      (operation) =>
        input.showsPlatformCost || operation.payer !== "storytorole"
    )
    .sort(
      (a, b) =>
        b.at.getTime() - a.at.getTime() ||
        b.operationId.localeCompare(a.operationId)
    );
}

/** A page of operations, from every call of the operations on it. */
export function buildUsageOperations(input: {
  calls: UsageCall[];
  debitedByTask: Map<string, number>;
  showsPlatformCost: boolean;
}): UsageOperationRow[] {
  return buildOperations(input).map(
    ({ rawUsd: _rawUsd, userId: _userId, ...row }) => row
  );
}

/**
 * The usage statement's totals by payer and averages per kind of
 * operation, over the operations whose last call falls in the window.
 */
export function buildUsageStatement(input: {
  calls: UsageCall[];
  debitedByTask: Map<string, number>;
  window: { from: Date; to: Date };
  showsPlatformCost: boolean;
}): UsageStatement {
  const operations = operationsInWindow(input);

  const payers: UsagePayer[] = ["credits", "key", "storytorole"];
  const totals = payers
    .map((payer) => {
      const ofPayer = operations.filter((row) => row.payer === payer);
      return {
        payer,
        operations: ofPayer.length,
        ...sumTokens(ofPayer),
        credits: ofPayer.reduce((total, row) => total + row.credits, 0),
        usd:
          input.showsPlatformCost || payer === "key"
            ? roundUsd(ofPayer.reduce((total, row) => total + row.rawUsd, 0))
            : null,
      };
    })
    .filter((total) => total.operations > 0);

  return {
    window: input.window,
    showsPlatformCost: input.showsPlatformCost,
    totals,
    summary: summarize(operations),
  };
}

type Operation = ReturnType<typeof buildOperations>[number];

/** The average of each kind of completed operation, costliest first. */
function summarize(operations: Operation[]) {
  const kinds = new Map<string, Operation[]>();
  for (const row of operations) {
    if (row.status !== "completed") continue;
    const key = JSON.stringify(row.operation);
    kinds.set(key, [...(kinds.get(key) ?? []), row]);
  }
  return [...kinds.values()]
    .map((rows) => {
      const count = rows.length;
      const totalCredits = rows.reduce((total, row) => total + row.credits, 0);
      const tokens = rows.reduce(
        (total, row) => total + row.inputTokens + row.outputTokens,
        0
      );
      // An average mixing hidden and shown US$ would mislead: all or none.
      const usdRows = rows.map((row) => row.usd);
      return {
        operation: rows[0].operation,
        count,
        averageCredits: oneDecimal(totalCredits / count),
        averageTokens: Math.round(tokens / count),
        averageUsd: usdRows.every((value) => value !== null)
          ? roundUsd(rows.reduce((total, row) => total + row.rawUsd, 0) / count)
          : null,
        totalCredits,
      };
    })
    .sort((a, b) => b.totalCredits - a.totalCredits);
}

/** The operations whose last call falls in the window. */
function operationsInWindow(input: {
  calls: UsageCall[];
  debitedByTask: Map<string, number>;
  window: { from: Date; to: Date };
  showsPlatformCost: boolean;
}) {
  return buildOperations(input).filter(
    (operation) =>
      operation.at >= input.window.from && operation.at < input.window.to
  );
}

/**
 * The usage statement over every user's calls (the admin's), with the
 * platform's cost, and each model's average use over the completed
 * operations that called it, the costliest model first.
 */
export function buildPlatformUsage(input: {
  calls: UsageCall[];
  debitedByTask: Map<string, number>;
  window: { from: Date; to: Date };
}): PlatformUsage {
  const scope = { ...input, showsPlatformCost: true };
  const parts = new Map<string, Array<UsageOperationRow["models"][number]>>();
  for (const operation of operationsInWindow(scope)) {
    if (operation.status !== "completed") continue;
    for (const part of operation.models) {
      parts.set(part.model, [...(parts.get(part.model) ?? []), part]);
    }
  }
  const models = [...parts.entries()]
    .map(([model, rows]) => {
      const count = rows.length;
      const sum = (pick: (row: (typeof rows)[number]) => number) =>
        rows.reduce((total, row) => total + pick(row), 0);
      const totalUsd = sum((row) => row.usd ?? 0);
      return {
        model,
        operations: count,
        averageInputTokens: Math.round(sum((row) => row.inputTokens) / count),
        averageOutputTokens: Math.round(sum((row) => row.outputTokens) / count),
        averageCredits: oneDecimal(sum((row) => row.credits) / count),
        averageUsd: roundUsd(totalUsd / count),
        totalUsd: roundUsd(totalUsd),
      };
    })
    .sort((a, b) => b.totalUsd - a.totalUsd);
  return { ...buildUsageStatement(scope), models };
}

/**
 * Each user's spending in the window (the admin's statement), the biggest
 * first, with their own average per kind of operation.
 */
export function buildPlatformUsers(input: {
  calls: UsageCall[];
  debitedByTask: Map<string, number>;
  window: { from: Date; to: Date };
  users: Map<string, { email: string; name: string | null }>;
}): PlatformUsageUser[] {
  const ofUsers = new Map<string, Operation[]>();
  for (const operation of operationsInWindow({
    ...input,
    showsPlatformCost: true,
  })) {
    ofUsers.set(operation.userId, [
      ...(ofUsers.get(operation.userId) ?? []),
      operation,
    ]);
  }
  return [...ofUsers.entries()]
    .map(([userId, rows]) => {
      const sum = (pick: (row: Operation) => number) =>
        rows.reduce((total, row) => total + pick(row), 0);
      const paidBy = (payer: UsagePayer) =>
        oneDecimal(sum((row) => (row.payer === payer ? row.credits : 0)));
      return {
        userId,
        email: input.users.get(userId)?.email ?? "",
        name: input.users.get(userId)?.name ?? null,
        operations: rows.length,
        creditsSpent: paidBy("credits"),
        keyCredits: paidBy("key"),
        storytoroleCredits: paidBy("storytorole"),
        usd: roundUsd(sum((row) => row.rawUsd)),
        summary: summarize(rows),
      };
    })
    .sort(
      (a, b) =>
        totalCredits(b) - totalCredits(a) || a.email.localeCompare(b.email)
    );
}

function totalCredits(user: PlatformUsageUser) {
  return user.creditsSpent + user.keyCredits + user.storytoroleCredits;
}

function isFinished(status: TaskStatus | null) {
  return status === "completed" || status === "failed";
}

function payerOf(calls: UsageCall[], debited: number | undefined) {
  if (calls.some((call) => call.funding === "key")) return "key" as const;
  return debited && debited > 0
    ? ("credits" as const)
    : ("storytorole" as const);
}

function operationOf(call: UsageCall): UsageOperation {
  if (!call.taskType) {
    return {
      taskType: null,
      documentKind: null,
      generationKind: null,
      purpose: call.purpose,
    };
  }
  return {
    taskType: call.taskType,
    documentKind: call.documentKind,
    generationKind: call.generationKind,
    purpose: null,
  };
}
