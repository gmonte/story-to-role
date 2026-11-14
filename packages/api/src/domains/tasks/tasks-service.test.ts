import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { runTask } from "./run-task";
import { TasksService } from "./tasks-service";

vi.mock("@trigger.dev/sdk", () => ({
  metadata: { set: vi.fn() },
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
    createRunReadToken: vi.fn(async () => "public_token"),
  };
}

describe("tasks", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("starts a run with only the task id and stores the run id", async () => {
    const db = await getTestDatabase();
    const user = await createUser("ada@example.com");
    const trigger = fakeTrigger();

    const { task, realtime } = await new TasksService(db, trigger).start({
      userId: user.id,
      type: "sample",
    });

    expect(trigger.trigger).toHaveBeenCalledWith("sample", { taskId: task.id });
    expect(task.runId).toBe("run_123");
    expect(task.status).toBe("pending");
    expect(realtime).toEqual({ runId: "run_123", accessToken: "run_token" });
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

    const [row] = await db.query.tasksTable.findMany();
    expect(row.status).toBe("failed");
  });

  it("gives a realtime token only to the task's owner", async () => {
    const db = await getTestDatabase();
    const ada = await createUser("ada@example.com");
    const grace = await createUser("grace@example.com");
    const service = new TasksService(db, fakeTrigger());
    const { task } = await service.start({ userId: ada.id, type: "sample" });

    await expect(
      service.createRealtimeToken({ taskId: task.id, userId: ada.id })
    ).resolves.toEqual({ runId: "run_123", accessToken: "public_token" });
    await expect(
      service.createRealtimeToken({ taskId: task.id, userId: grace.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("tracks a run from processing to completed with its progress", async () => {
    const db = await getTestDatabase();
    const user = await createUser("ada@example.com");
    const service = new TasksService(db, fakeTrigger());
    const { task } = await service.start({ userId: user.id, type: "sample" });

    await runTask({ db, taskId: task.id, type: "sample" }, async (context) => {
      expect(context.userId).toBe(user.id);
      await context.reportProgress({ step: 1, totalSteps: 1 });
    });

    const done = await service.getForUser({ taskId: task.id, userId: user.id });
    expect(done.status).toBe("completed");
    expect(done.progress).toEqual({ step: 1, totalSteps: 1 });
    expect(done.finishedAt).toBeInstanceOf(Date);
  });

  it("stores a fixed message when a run fails, never the error's content", async () => {
    const db = await getTestDatabase();
    const user = await createUser("ada@example.com");
    const service = new TasksService(db, fakeTrigger());
    const { task } = await service.start({ userId: user.id, type: "sample" });

    await expect(
      runTask({ db, taskId: task.id, type: "sample" }, async () => {
        throw new Error("Prompt: I led the Acme migration");
      })
    ).rejects.toThrow();

    const failed = await service.getForUser({
      taskId: task.id,
      userId: user.id,
    });
    expect(failed.status).toBe("failed");
    expect(failed.errorMessage).toBe("The task failed");
  });
});
