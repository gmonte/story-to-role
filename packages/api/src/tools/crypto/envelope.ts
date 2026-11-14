import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Envelope encryption (privacy spec): every user has a random data key that
 * encrypts their career content and bring-your-own keys; the data key is
 * stored wrapped by a versioned master key from the environment. Deleting a
 * user's wrapped key makes every copy of their content, backups included,
 * unreadable.
 *
 * Both layers use AES-256-GCM with the user id as additional authenticated
 * data, so a value copied into another user's row fails to decrypt.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
// Prefix of every encrypted value, so the format can evolve.
const CIPHERTEXT_VERSION = "e1";

export type MasterKey = { version: number; key: Buffer };

export type MasterKeys = {
  current: MasterKey;
  byVersion: Map<number, Buffer>;
};

export type WrappedDataKey = {
  wrappedKey: string;
  masterKeyVersion: number;
};

function parseMasterKey(value: string): MasterKey {
  const match = /^v(\d+):(.+)$/.exec(value.trim());
  const key = match ? Buffer.from(match[2], "base64") : undefined;

  if (!match || key?.length !== KEY_BYTES) {
    throw new Error(
      "Master keys must look like v<version>:<base64 of 32 bytes>"
    );
  }

  return { version: Number(match[1]), key: key };
}

/** `current` wraps new data keys; `previous` (comma-separated) only unwraps. */
export function parseMasterKeys(
  current: string,
  previous?: string
): MasterKeys {
  const currentKey = parseMasterKey(current);
  const byVersion = new Map([[currentKey.version, currentKey.key]]);

  for (const value of previous?.split(",").filter(Boolean) ?? []) {
    const { version, key } = parseMasterKey(value);
    byVersion.set(version, key);
  }

  return { current: currentKey, byVersion };
}

export function generateDataKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

function seal(plaintext: Buffer, key: Buffer, aad: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString("base64url"))
    .join(".");
}

function open(sealed: string, key: Buffer, aad: string): Buffer {
  const [iv, authTag, ciphertext] = sealed
    .split(".")
    .map((part) => Buffer.from(part, "base64url"));

  if (!iv || !authTag || !ciphertext) {
    throw new Error("Malformed encrypted value");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function wrapDataKey(
  dataKey: Buffer,
  masterKeys: MasterKeys,
  userId: string
): WrappedDataKey {
  return {
    wrappedKey: seal(dataKey, masterKeys.current.key, `data-key:${userId}`),
    masterKeyVersion: masterKeys.current.version,
  };
}

export function unwrapDataKey(
  { wrappedKey, masterKeyVersion }: WrappedDataKey,
  masterKeys: MasterKeys,
  userId: string
): Buffer {
  const masterKey = masterKeys.byVersion.get(masterKeyVersion);

  if (!masterKey) {
    throw new Error(`The master key v${masterKeyVersion} is not configured`);
  }

  return open(wrappedKey, masterKey, `data-key:${userId}`);
}

export function encrypt(plaintext: string, dataKey: Buffer, userId: string) {
  return `${CIPHERTEXT_VERSION}:${seal(Buffer.from(plaintext, "utf8"), dataKey, userId)}`;
}

export function decrypt(value: string, dataKey: Buffer, userId: string) {
  const prefix = `${CIPHERTEXT_VERSION}:`;

  if (!value.startsWith(prefix)) {
    throw new Error("Unknown encrypted value format");
  }

  return open(value.slice(prefix.length), dataKey, userId).toString("utf8");
}
