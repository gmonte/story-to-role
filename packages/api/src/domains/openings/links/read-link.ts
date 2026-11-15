import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

import { extractText } from "unpdf";

/**
 * Reads a link attached in the chat (workspace spec, "Links"): code reads
 * it, never the model, in a task with no database access and no AI keys.
 * Only http and https; private, loopback and link-local addresses are
 * refused when the name resolves (on every redirect, at connection time, so
 * DNS rebinding can't slip through); at most 3 redirects, a short timeout, a
 * size limit, and only HTML, plain text and PDF. No cookie or credential is
 * ever sent. Returns text only.
 */
export const linkLimits = {
  maxRedirects: 3,
  timeoutMs: 10_000,
  maxBytes: 3 * 1024 * 1024,
  maxCharacters: 60_000,
};

export type LinkResult =
  | { ok: true; text: string }
  | {
      ok: false;
      reason:
        | "invalid_url"
        | "blocked_address"
        | "too_many_redirects"
        | "unsupported_type"
        | "too_large"
        | "unreachable"
        | "needs_paste";
    };

/** True only for addresses on the public internet. */
export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower.startsWith("::ffff:")) return isPublicAddress(lower.slice(7));
    return !(
      // Unspecified, loopback and IPv4-compatible (::a.b.c.d) addresses.
      (
        lower.startsWith("::") ||
        // NAT64, 6to4 and documentation prefixes reach IPv4 or nothing public.
        lower.startsWith("64:ff9b:") ||
        lower.startsWith("2002:") ||
        lower.startsWith("2001:db8:") ||
        lower.startsWith("fc") ||
        lower.startsWith("fd") ||
        lower.startsWith("fe8") ||
        lower.startsWith("fe9") ||
        lower.startsWith("fea") ||
        lower.startsWith("feb") ||
        lower.startsWith("ff")
      )
    );
  }
  return false;
}

class BlockedAddressError extends Error {}

/**
 * DNS lookup that refuses non-public addresses, used for the connection.
 * Every resolved address must be public; the answer keeps the shape the
 * caller asked for (Node's family autoselection asks for `all`).
 */
const safeLookup = ((
  hostname: string,
  options: { all?: boolean; family?: number },
  callback: (...args: unknown[]) => void
) => {
  dnsLookup(
    hostname,
    { all: true, family: options?.family ?? 0 },
    (error, addresses) => {
      if (error) return callback(error);
      if (
        addresses.length === 0 ||
        addresses.some(({ address }) => !isPublicAddress(address))
      ) {
        return callback(new BlockedAddressError(hostname));
      }
      if (options?.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    }
  );
}) as unknown as typeof dnsLookup;

type Response = {
  status: number;
  location?: string;
  contentType: string;
  body: Buffer | "too_large";
};

function request(url: URL): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (isIP(url.hostname) && !isPublicAddress(url.hostname)) {
      return reject(new BlockedAddressError(url.hostname));
    }
    const client = url.protocol === "https:" ? https : http;
    const req = client.get(
      url,
      {
        lookup: safeLookup,
        timeout: linkLimits.timeoutMs,
        headers: {
          "user-agent": "StoryToRole link reader",
          accept: "text/html, text/plain, application/pdf",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > linkLimits.maxBytes) {
            res.destroy();
            resolve({
              status: res.statusCode ?? 0,
              contentType: "",
              body: "too_large",
            });
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location,
            contentType: (res.headers["content-type"] ?? "").toLowerCase(),
            body: Buffer.concat(chunks),
          })
        );
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    // The socket timeout only catches idleness; a slow drip hits this.
    const deadline = setTimeout(
      () => req.destroy(new Error("timeout")),
      linkLimits.timeoutMs
    );
    req.on("close", () => clearTimeout(deadline));
    req.on("error", reject);
  });
}

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** HTML to plain text: drop scripts, styles and tags, keep block breaks. */
export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (match, code: string) => {
      if (code.startsWith("#x"))
        return String.fromCodePoint(parseInt(code.slice(2), 16));
      if (code.startsWith("#"))
        return String.fromCodePoint(Number(code.slice(1)));
      return entities[code.toLowerCase()] ?? match;
    })
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export async function readLink(
  rawUrl: string,
  fetchOnce: (url: URL) => Promise<Response> = request
): Promise<LinkResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "invalid_url" };
  }
  // Credentials in the URL are dropped: no user session is ever used.
  url.username = "";
  url.password = "";

  for (let redirects = 0; ; redirects++) {
    let response: Response;
    try {
      response = await fetchOnce(url);
    } catch (error) {
      return {
        ok: false,
        reason:
          error instanceof BlockedAddressError
            ? "blocked_address"
            : "unreachable",
      };
    }

    if (response.status >= 300 && response.status < 400 && response.location) {
      if (redirects >= linkLimits.maxRedirects) {
        return { ok: false, reason: "too_many_redirects" };
      }
      const next = new URL(response.location, url);
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        return { ok: false, reason: "invalid_url" };
      }
      url = next;
      continue;
    }

    if (response.body === "too_large")
      return { ok: false, reason: "too_large" };
    // Login walls and blocks lead to a request to paste the text.
    if (response.status !== 200) return { ok: false, reason: "needs_paste" };

    let text: string;
    if (response.contentType.includes("application/pdf")) {
      try {
        text = (
          await extractText(new Uint8Array(response.body), { mergePages: true })
        ).text;
      } catch {
        return { ok: false, reason: "unsupported_type" };
      }
    } else if (response.contentType.includes("text/html")) {
      text = htmlToText(response.body.toString("utf8"));
    } else if (response.contentType.includes("text/plain")) {
      text = response.body.toString("utf8");
    } else {
      return { ok: false, reason: "unsupported_type" };
    }

    // Pages that only render with JavaScript come back nearly empty.
    if (text.trim().length < 200) return { ok: false, reason: "needs_paste" };
    return { ok: true, text: text.slice(0, linkLimits.maxCharacters) };
  }
}
