import { env } from "@repo/common/env/web.env";
import type { DbClient } from "@repo/api/tools/db-client";
import {
  decrypt,
  encrypt,
  generateDataKey,
  parseMasterKeys,
  unwrapDataKey,
  wrapDataKey,
  type MasterKeys,
} from "@repo/api/tools/crypto/envelope";

import { UserDataKeysRepository } from "./user-data-keys-repository";

export type UserCipher = {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
};

let masterKeys: MasterKeys | undefined;

function getMasterKeys() {
  masterKeys ??= parseMasterKeys(
    env.ENCRYPTION_MASTER_KEY,
    env.ENCRYPTION_PREVIOUS_MASTER_KEYS
  );
  return masterKeys;
}

/**
 * Encrypts and decrypts one user's career content in memory. Repositories
 * store only the ciphertext; services build a cipher for the user they act
 * for, creating the user's data key on first use.
 */
export async function getUserCipher(
  tx: DbClient,
  userId: string,
  keys: MasterKeys = getMasterKeys()
): Promise<UserCipher> {
  const repository = new UserDataKeysRepository(tx);

  let wrapped = await repository.findByUserId(userId);
  if (!wrapped) {
    await repository.insertIfMissing(
      userId,
      wrapDataKey(generateDataKey(), keys, userId)
    );
    wrapped = await repository.findByUserId(userId);
  }
  if (!wrapped) throw new Error("The user's data key could not be created");

  const dataKey = unwrapDataKey(wrapped, keys, userId);

  return {
    encrypt: (plaintext) => encrypt(plaintext, dataKey, userId),
    decrypt: (ciphertext) => decrypt(ciphertext, dataKey, userId),
  };
}
