/**
 * Regenerates the brand assets from the mark's geometry (docs/plan.md, slice 1):
 * apps/web/public/brand/*.svg, apps/web/src/app/icon.svg, icon1.png (16 px),
 * icon2.png (24 px) and apple-icon.png. The lockup text is converted to paths
 * so the SVGs don't depend on Space Grotesk being installed.
 *
 * Run it outside the workspace (it needs opentype.js and sharp, which the app
 * doesn't), with the Space Grotesk 600 WOFF from @fontsource/space-grotesk:
 *   node build-brand-assets.mjs <space-grotesk-latin-600-normal.woff> \
 *     apps/web/public/brand apps/web/src/app
 */
import fs from "node:fs";
import path from "node:path";
import opentype from "opentype.js";
import sharp from "sharp";

const [fontPath, outDir, appDir] = process.argv.slice(2);
const font = opentype.parse(fs.readFileSync(fontPath).buffer);

// opentype.js's toPathData emits NaN for some of this font's curves.
const n = (v) => Number(v.toFixed(2));
function pathData(path) {
  return path.commands
    .map((c) => {
      if (c.type === "M" || c.type === "L") return `${c.type}${n(c.x)} ${n(c.y)}`;
      if (c.type === "Q") return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
      if (c.type === "C")
        return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
      return "Z";
    })
    .join("");
}

// Glyph by glyph: opentype.js's layout yields NaN on this font's GPOS data.
function textToPath(text, x, y, size) {
  const scale = size / font.unitsPerEm;
  const glyphs = font.stringToGlyphs(text);
  const combined = new opentype.Path();
  let cursor = x;
  glyphs.forEach((glyph, index) => {
    // Built at the origin and shifted by hand: glyph.getPath at fractional
    // offsets emits NaN for some curves of this font.
    for (const command of glyph.getPath(0, 0, size).commands) {
      const shifted = { ...command };
      for (const key of ["x", "x1", "x2"]) if (key in shifted) shifted[key] += cursor;
      for (const key of ["y", "y1", "y2"]) if (key in shifted) shifted[key] += y;
      combined.commands.push(shifted);
    }
    const next = glyphs[index + 1];
    const kerning = next ? font.getKerningValue(glyph, next) : 0;
    cursor += (glyph.advanceWidth + (Number.isFinite(kerning) ? kerning : 0)) * scale;
  });
  return combined;
}

const themes = {
  light: { ink: "#15171C", accent: "#D9480F" },
  dark: { ink: "#F6F6F3", accent: "#FF8A4C" },
};

const line = (x1, x2, y, color, extra = "") =>
  `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}"${extra}/>`;

function markBody({ ink, accent }) {
  return [
    `<g stroke-width="7" stroke-linecap="round" fill="none">`,
    line(21, 48, 13, ink),
    line(11, 35, 26, ink),
    line(22, 52, 39, ink),
    line(10, 41, 52, accent),
    `</g>`,
    `<circle cx="52.5" cy="52" r="4.75" fill="${accent}"/>`,
  ].join("");
}

const svg = (w, h, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}">${body}</svg>\n`;

// The lockup is one color: the mark's accent line takes the text color too.
const fontSize = 40;
const textPath = textToPath("StoryToRole", 0, 0, fontSize);
const box = textPath.getBoundingBox();
const textX = 80;
const capHeight = (font.tables.os2.sCapHeight / font.unitsPerEm) * fontSize;
const baseline = 32 + capHeight / 2;
const textWidth = box.x2 - box.x1;
const lockupWidth = Math.ceil(textX + textWidth + 2);

for (const [name, colors] of Object.entries(themes)) {
  fs.writeFileSync(
    path.join(outDir, `mark-${name}.svg`),
    svg(64, 64, markBody(colors), "StoryToRole")
  );

  const d = pathData(textToPath("StoryToRole", textX - box.x1, baseline, fontSize));
  const oneColor = { ink: colors.ink, accent: colors.ink };
  fs.writeFileSync(
    path.join(outDir, `lockup-${name}.svg`),
    svg(
      lockupWidth,
      64,
      `${markBody(oneColor)}<path d="${d}" fill="${colors.ink}"/>`,
      "StoryToRole"
    )
  );
}

// App icon: the mark in white on an accent rounded square, upper lines at 65%.
const fullIcon = [
  `<rect width="64" height="64" rx="14" fill="${themes.light.accent}"/>`,
  `<g transform="translate(8 8) scale(0.75)">`,
  `<g stroke-width="7" stroke-linecap="round" fill="none" stroke="#FFFFFF">`,
  `<g stroke-opacity="0.65">`,
  line(21, 48, 13, "#FFFFFF"),
  line(11, 35, 26, "#FFFFFF"),
  line(22, 52, 39, "#FFFFFF"),
  `</g>`,
  line(10, 41, 52, "#FFFFFF"),
  `</g>`,
  `<circle cx="52.5" cy="52" r="4.75" fill="#FFFFFF"/>`,
  `</g>`,
].join("");

// At 16 and 24 px: the three-line cut with a heavier stroke.
const smallIcon = [
  `<rect width="64" height="64" rx="14" fill="${themes.light.accent}"/>`,
  `<g transform="translate(6 6) scale(0.8125)">`,
  `<g stroke-width="10" stroke-linecap="round" fill="none" stroke="#FFFFFF">`,
  `<g stroke-opacity="0.65">`,
  line(24, 50, 16, "#FFFFFF"),
  line(11, 37, 32, "#FFFFFF"),
  `</g>`,
  line(10, 38, 48, "#FFFFFF"),
  `</g>`,
  `<circle cx="53" cy="48" r="5" fill="#FFFFFF"/>`,
  `</g>`,
].join("");

// icon.svg is the full mark; 16 and 24 px get the three-line cut as PNGs.
fs.writeFileSync(path.join(appDir, "icon.svg"), svg(64, 64, fullIcon, "StoryToRole"));
for (const [index, size] of [[1, 16], [2, 24]]) {
  await sharp(Buffer.from(svg(64, 64, smallIcon, "StoryToRole")), { density: 300 })
    .resize(size, size)
    .png()
    .toFile(path.join(appDir, `icon${index}.png`));
}
fs.writeFileSync(path.join(outDir, "app-icon.svg"), svg(64, 64, fullIcon, "StoryToRole"));

await sharp(Buffer.from(svg(64, 64, fullIcon, "StoryToRole")), { density: 288 * 4 })
  .resize(180, 180)
  .png()
  .toFile(path.join(appDir, "apple-icon.png"));

console.log("Brand assets written");
