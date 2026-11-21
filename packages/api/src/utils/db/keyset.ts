/**
 * Opaque keyset cursor: the boundary row's sort-key values (in the list's
 * order) plus its unique id, which breaks ties on equal sort values.
 */
export type CursorPayload = { keys: unknown[]; id: string };

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

/** The cursor's payload; null for none or for one that doesn't parse. */
export function decodeCursor(cursor?: string | null): CursorPayload | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    ) as CursorPayload;
    if (parsed && Array.isArray(parsed.keys) && typeof parsed.id === "string") {
      return parsed;
    }
  } catch {
    // A tampered or stale cursor reads as the first page.
  }
  return null;
}
