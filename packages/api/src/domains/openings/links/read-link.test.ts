import { describe, expect, it } from "vitest";

import { htmlToText, isPublicAddress, readLink } from "./read-link";

const posting = `<html><head><title>x</title><script>alert(1)</script></head><body>
<h1>Senior Platform Engineer</h1><p>We need 8+ years with Kubernetes &amp; Go.</p>
<p>${"Remote in Brazil. Build our developer platform. ".repeat(8)}</p></body></html>`;

function fakeServer(
  responses: Record<
    string,
    { status: number; location?: string; contentType?: string; body?: string }
  >
) {
  const visited: string[] = [];
  const fetchOnce = async (url: URL) => {
    visited.push(url.href);
    const response = responses[url.href];
    if (!response) throw new Error("unreachable");
    return {
      status: response.status,
      location: response.location,
      contentType: response.contentType ?? "text/html; charset=utf-8",
      body: Buffer.from(response.body ?? ""),
    };
  };
  return { fetchOnce, visited };
}

describe("link reader", () => {
  it("refuses private, loopback and link-local addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "0.0.0.0",
    ]) {
      expect(isPublicAddress(address)).toBe(false);
    }
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700::1111")).toBe(true);
  });

  it("refuses non-http schemes and literal private hosts", async () => {
    expect(await readLink("file:///etc/passwd")).toEqual({
      ok: false,
      reason: "invalid_url",
    });
    expect(await readLink("http://169.254.169.254/latest/meta-data")).toEqual({
      ok: false,
      reason: "blocked_address",
    });
  });

  it("returns the page as text, without scripts", async () => {
    const server = fakeServer({
      "https://jobs.example.com/1": { status: 200, body: posting },
    });

    const result = await readLink(
      "https://jobs.example.com/1",
      server.fetchOnce
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain("8+ years with Kubernetes & Go.");
    expect(result.text).not.toContain("alert");
  });

  it("follows at most 3 redirects", async () => {
    const server = fakeServer({
      "https://a.example.com/": {
        status: 302,
        location: "https://b.example.com/",
      },
      "https://b.example.com/": { status: 301, location: "/c" },
      "https://b.example.com/c": {
        status: 302,
        location: "https://d.example.com/",
      },
      "https://d.example.com/": {
        status: 302,
        location: "https://e.example.com/",
      },
    });

    expect(await readLink("https://a.example.com/", server.fetchOnce)).toEqual({
      ok: false,
      reason: "too_many_redirects",
    });
    expect(server.visited).toHaveLength(4);
  });

  it("asks for the text when the page needs a login or JavaScript", async () => {
    const login = fakeServer({ "https://x.example.com/": { status: 403 } });
    const spa = fakeServer({
      "https://y.example.com/": { status: 200, body: "<div id=root></div>" },
    });

    expect(await readLink("https://x.example.com/", login.fetchOnce)).toEqual({
      ok: false,
      reason: "needs_paste",
    });
    expect(await readLink("https://y.example.com/", spa.fetchOnce)).toEqual({
      ok: false,
      reason: "needs_paste",
    });
  });

  it("refuses types other than HTML, text and PDF", async () => {
    const server = fakeServer({
      "https://z.example.com/": {
        status: 200,
        contentType: "application/zip",
        body: "PK",
      },
    });

    expect(await readLink("https://z.example.com/", server.fetchOnce)).toEqual({
      ok: false,
      reason: "unsupported_type",
    });
  });

  it("decodes entities and keeps paragraph breaks", () => {
    expect(htmlToText("<p>A &amp; B</p><p>C&#33;</p>")).toBe("A & B\nC!");
  });
});
