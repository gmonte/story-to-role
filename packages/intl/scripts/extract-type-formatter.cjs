const fs = require("node:fs");
const path = require("node:path");

function format(msgs) {
  const messages = Object.values(msgs)
    .map((msg) => msg.defaultMessage)
    .filter(Boolean);

  const unique = Array.from(new Set(messages)).sort((a, b) =>
    a.localeCompare(b)
  );

  const lines = unique.map(
    (m) => `  | ${JSON.stringify(m)}`
  );

  const content = `export type IntlMessage =\n${lines.join("\n") || "  string"};\n`;

  const outFile = path.resolve(__dirname, "..", "intl-message-types.ts");
  fs.writeFileSync(outFile, content, "utf8");

  return msgs;
}

module.exports = { format };
