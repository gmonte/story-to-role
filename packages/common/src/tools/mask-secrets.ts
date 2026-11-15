// Provider API keys (Anthropic's `sk-ant-…`, OpenAI's `sk-…`).
const secretPattern = /\b(sk-(?:ant-)?)[A-Za-z0-9_-]{12,}([A-Za-z0-9_-]{4})/g;

const maskText = (text: string) => text.replace(secretPattern, "$1…$2");

/**
 * What the logger prints instead of `value`: every API key inside it,
 * however deep, reduced to its prefix and last characters (guided
 * interview spec: a saved key "is masked by the logger").
 */
export function maskSecrets(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return maskText(value);
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (value instanceof Error) {
    // Its fields as a plain object: a provider error's code, status and
    // body (and its cause) stay readable, with any key masked.
    return {
      ...(maskSecrets({ ...value }, depth + 1) as object),
      name: value.name,
      message: maskText(value.message),
      stack: value.stack && maskText(value.stack),
      cause: maskSecrets(value.cause, depth + 1),
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => maskSecrets(item, depth + 1));
  }
  // Dates, maps and other instances print as they are.
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      maskSecrets(item, depth + 1),
    ])
  );
}
