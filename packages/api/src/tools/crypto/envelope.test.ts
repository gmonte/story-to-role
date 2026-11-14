import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  decrypt,
  encrypt,
  generateDataKey,
  parseMasterKeys,
  unwrapDataKey,
  wrapDataKey,
} from "./envelope";

const keyV1 = `v1:${randomBytes(32).toString("base64")}`;
const keyV2 = `v2:${randomBytes(32).toString("base64")}`;

describe("envelope encryption", () => {
  it("round-trips text with a data key and hides the plaintext", () => {
    const dataKey = generateDataKey();
    const ciphertext = encrypt(
      "Led the payments team at Acme",
      dataKey,
      "user-1"
    );

    expect(ciphertext).not.toContain("Acme");
    expect(decrypt(ciphertext, dataKey, "user-1")).toBe(
      "Led the payments team at Acme"
    );
  });

  it("never produces the same ciphertext twice", () => {
    const dataKey = generateDataKey();
    expect(encrypt("same", dataKey, "u")).not.toBe(
      encrypt("same", dataKey, "u")
    );
  });

  it("refuses a ciphertext bound to another user", () => {
    const dataKey = generateDataKey();
    const ciphertext = encrypt("secret", dataKey, "user-1");

    expect(() => decrypt(ciphertext, dataKey, "user-2")).toThrow();
  });

  it("refuses a tampered ciphertext", () => {
    const dataKey = generateDataKey();
    const ciphertext = encrypt("secret", dataKey, "user-1");
    const tampered =
      ciphertext.slice(0, -2) + (ciphertext.endsWith("A") ? "BB" : "AA");

    expect(() => decrypt(tampered, dataKey, "user-1")).toThrow();
  });

  it("wraps a data key with the current master key and unwraps it", () => {
    const masterKeys = parseMasterKeys(keyV1);
    const dataKey = generateDataKey();

    const wrapped = wrapDataKey(dataKey, masterKeys, "user-1");

    expect(wrapped.masterKeyVersion).toBe(1);
    expect(unwrapDataKey(wrapped, masterKeys, "user-1").equals(dataKey)).toBe(
      true
    );
  });

  it("keeps data keys wrapped by a previous master key readable after rotation", () => {
    const dataKey = generateDataKey();
    const wrapped = wrapDataKey(dataKey, parseMasterKeys(keyV1), "user-1");

    const rotated = parseMasterKeys(keyV2, keyV1);

    expect(rotated.current.version).toBe(2);
    expect(unwrapDataKey(wrapped, rotated, "user-1").equals(dataKey)).toBe(
      true
    );
  });

  it("fails when the master key that wrapped a data key is gone", () => {
    const wrapped = wrapDataKey(generateDataKey(), parseMasterKeys(keyV1), "u");

    expect(() => unwrapDataKey(wrapped, parseMasterKeys(keyV2), "u")).toThrow(
      "master key v1"
    );
  });
});
