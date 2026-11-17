import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { tasksTable } from "./db/tasks-tables";
import { runTask } from "./run-task";
import { TasksService } from "./tasks-service";

vi.mock("@repo/api/tools/trigger/trigger-client", () => ({
  triggerClient: { trigger: vi.fn(), reportProgress: vi.fn() },
}));

async function createUser(email: string) {
  const db = await getTestDatabase();
  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `clerk_${email}`,
      email,
      firstName: "",
      lastName: "",
      fullName: "",
    })
    .returning();
  return user;
}

function fakeTrigger() {
  return {
    trigger: vi.fn(async () => ({
      runId: "run_123",
      accessToken: "run_token",
    })),
  };
}

async function findTask(taskId: string) {
  const db = await getTestDatabase();
  const [row] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, taskId));
  return row;
}

describe("tasks", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("starts a run with only the task id and returns its realtime token", async () => {
    const db = await getTestDatabase();
    const user = await createUser("ada@example.com");
    const trigger = fakeTrigger();

    const { task, realtime } = await new TasksService(db, trigger).start({
      userId: user.id,
      type: "sample",
    });

    expect(trigger.trigger).toHaveBeenCalledWith("sample", { taskId: task.id });
    expect(realtime).toEqual({ runId: "run_123", accessToken: "run_token" });
    expect(await findTask(task.id)).toMatchObject({
      status: "pending",
      runId: "run_123",
    });
  });

  it("marks the task failed when the run can't start", async () => {
    const db = await getTestDatabase();
    const user = await createUser("ada@example.com");
    const trigger = fakeTrigger();
    trigger.trigger.mockRejectedValueOnce(new Error("Trigger.dev is down"));
    const service = new TasksService(db, trigger);

    await expect(
      service.start({ userId: user.id, type: "sample" })
    ).rejects.toThrow();

    const [row] = await db.select().from(tasksTable);
    expect(row.status).toBe("failed");
  });

  it("gives the run the task's owner and subject, and tracks it to completion", async () => {
    const db = await getTestDatabase();
    const user = await createUser("ada@example.com");
    const subjectId = crypto.randomUUID();
    const { task } = await new TasksService(db, fakeTrigger()).start({
      userId: user.id,
      type: "sample",
      subjectId,
    });

    await runTask({ db, taskId: task.id, type: "sample" }, async (context) => {
      expect(context.userId).toBe(user.id);
      expect(context.subjectId).toBe(subjectId);
      await context.reportProgress({ step: 1, totalSteps: 1 });
    });

    const done = await findTask(task.id);
    expect(done.status).toBe("completed");
    expect(done.progress).toEqual({ step: 1, totalSteps: 1 });
    expect(done.finishedAt).toBeInstanceOf(Date);
  });

  it("refuses to run a task of another type", async () => {
    const db = await getTestDatabase();
    const user = await createUser("ada@example.com");
    const { task } = await new TasksService(db, fakeTrigger()).start({
      userId: user.id,
      type: "sample",
    });

    await expect(
      runTask(
        { db, taskId: task.id, type: "motivation_turn" },
        async () => undefined
      )
    ).rejects.toThrow("is not a motivation_turn task");
  });

  it("stores a fixed message when a run fails, never the error's content", async () => {
    const db = await getTestDatabase();
    const user = await createUser("ada@example.com");
    const { task } = await new TasksService(db, fakeTrigger()).start({
      userId: user.id,
      type: "sample",
    });

    await expect(
      runTask({ db, taskId: task.id, type: "sample" }, async () => {
        throw new Error("Prompt: I led the Acme migration");
      })
    ).rejects.toThrow();

    const failed = await findTask(task.id);
    expect(failed.status).toBe("failed");
    expect(failed.errorMessage).toBe("The task failed");
  });
});
