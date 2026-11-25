import type { ProfileBlock } from "./blocks";
import type { ProfileFinding } from "./lint";

const k = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** SHA-256 as hex, pure and synchronous so the browser and the server agree. */
export function sha256Hex(text: string) {
  const data = new TextEncoder().encode(text);
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((data.length * 8) / 2 ** 32));
  view.setUint32(padded.length - 4, (data.length * 8) >>> 0);
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const t1 = (hh + s1 + ((e & f) ^ (~e & g)) + k[i] + w[i]) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  return [...h].map((n) => n.toString(16).padStart(8, "0")).join("");
}

/**
 * The key a dismissed finding is stored under: the code, the text the
 * finding covers (the term, the figure, the dates) and its params, not the
 * whole line, so editing elsewhere in a long line keeps it ignored; changing
 * that text brings it back. Shared by the browser and the server.
 */
export function findingKey(finding: ProfileFinding, blocks: ProfileBlock[]) {
  const span =
    finding.line === null
      ? ""
      : (blocks[finding.line]?.text.slice(finding.from, finding.to).trim() ??
        "");
  return sha256Hex(
    `${finding.code} | span: ${span} | ${JSON.stringify(finding.params ?? {})}`
  ).slice(0, 16);
}

/** The key of findings ignored before keys stopped using the whole line. */
function lineKey(finding: ProfileFinding, blocks: ProfileBlock[]) {
  const line =
    finding.line === null ? "" : (blocks[finding.line]?.text.trim() ?? "");
  return sha256Hex(
    `${finding.code} | ${line} | ${JSON.stringify(finding.params ?? {})}`
  ).slice(0, 16);
}

/** Every key a finding may be stored under (restoring removes them all). */
export function findingKeys(finding: ProfileFinding, blocks: ProfileBlock[]) {
  return [findingKey(finding, blocks), lineKey(finding, blocks)];
}

/**
 * The key a resolved review note is stored under (with the ignored
 * findings): its message and its quote. A new validation writes new notes,
 * so the keys of notes that no longer exist are harmless.
 */
export function reviewNoteKey(note: { message: string; quote: string }) {
  return sha256Hex(`review | ${note.message} | ${note.quote}`).slice(0, 16);
}

/**
 * The key a rejected competency level proposal is stored under (with the
 * ignored findings): the competency and the level proposed, so a later
 * validation proposing another level shows it again.
 */
export function levelProposalKey(proposal: { name: string; level: string }) {
  return sha256Hex(
    `level | ${proposal.name.trim().toLowerCase()} | ${proposal.level}`
  ).slice(0, 16);
}

/** Findings the user hasn't ignored; format findings can't be ignored. */
export function withoutDismissed(
  findings: ProfileFinding[],
  blocks: ProfileBlock[],
  dismissed: readonly string[]
) {
  const hidden = new Set(dismissed);
  return findings.filter(
    (finding) =>
      finding.kind === "format" ||
      !findingKeys(finding, blocks).some((key) => hidden.has(key))
  );
}
