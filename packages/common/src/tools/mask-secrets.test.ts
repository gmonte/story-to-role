import { describe, expect, it } from "vitest";

import { maskSecrets } from "./mask-secrets";

describe("maskSecrets", () => {
  const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789-WXYZ";

  it("masks keys in strings, objects and errors", () => {
    expect(maskSecrets(`key ${key} here`)).toBe("key sk-ant-…WXYZ here");
    expect(maskSecrets({ nested: [{ apiKey: key }] })).toEqual({
      nested: [{ apiKey: "sk-ant-…WXYZ" }],
    });
    const masked = maskSecrets(new Error(`bad ${key}`)) as Error;
    expect(masked.message).toBe("bad sk-ant-…WXYZ");
  });

  it("leaves other values alone", () => {
    expect(maskSecrets("task-1234 failed")).toBe("task-1234 failed");
    expect(maskSecrets(42)).toBe(42);
    const date = new Date();
    expect(maskSecrets({ date })).toEqual({ date });
  });
});
