import type { JSONContent } from "@tiptap/core";

/**
 * The opening's description as the editor's document and back. Plain
 * Markdown: paragraphs, `#` headings, `-` and `1.` lists, `**bold**` and
 * `*italic*`. Anything else the user typed stays as text.
 */

function inline(text: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index;
    if (at > last) nodes.push({ type: "text", text: text.slice(last, at) });
    const bold = match[1] !== undefined;
    nodes.push({
      type: "text",
      text: match[1] ?? match[2],
      marks: [{ type: bold ? "bold" : "italic" }],
    });
    last = at + match[0].length;
  }
  if (last < text.length) nodes.push({ type: "text", text: text.slice(last) });
  return nodes;
}

function paragraph(text: string): JSONContent {
  const content = inline(text);
  return content.length
    ? { type: "paragraph", content }
    : { type: "paragraph" };
}

export function markdownToDoc(markdown: string): JSONContent {
  const content: JSONContent[] = [];
  let list = null as JSONContent | null;
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const item = bullet ?? ordered;
    if (item) {
      const type = bullet ? "bulletList" : "orderedList";
      if (list?.type !== type) {
        list = { type, content: [] };
        content.push(list);
      }
      list.content?.push({
        type: "listItem",
        content: [paragraph(item[1])],
      });
      continue;
    }
    list = null;
    if (heading) {
      content.push({
        type: "heading",
        attrs: { level: heading[1].length },
        content: inline(heading[2]),
      });
    } else if (line.trim()) {
      content.push(paragraph(line));
    }
  }
  return {
    type: "doc",
    content: content.length ? content : [{ type: "paragraph" }],
  };
}

function inlineToMarkdown(nodes: JSONContent[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === "hardBreak") return "\n";
      const text = node.text ?? "";
      const marks = node.marks?.map((mark) => mark.type) ?? [];
      if (!text.trim()) return text;
      const lead = /^\s*/.exec(text)?.[0] ?? "";
      const trail = /\s*$/.exec(text)?.[0] ?? "";
      let core = text.trim();
      if (marks.includes("italic")) core = `*${core}*`;
      if (marks.includes("bold")) core = `**${core}**`;
      return `${lead}${core}${trail}`;
    })
    .join("");
}

export function docToMarkdown(doc: JSONContent): string {
  const blocks = (doc.content ?? []).map((node) => {
    if (node.type === "heading") {
      const level = Number(node.attrs?.level ?? 2);
      return `${"#".repeat(level)} ${inlineToMarkdown(node.content)}`;
    }
    if (node.type === "bulletList" || node.type === "orderedList") {
      return (node.content ?? [])
        .map((item, index) => {
          const text = (item.content ?? [])
            .map((child) => inlineToMarkdown(child.content))
            .join("\n");
          return `${node.type === "bulletList" ? "-" : `${index + 1}.`} ${text}`;
        })
        .join("\n");
    }
    return inlineToMarkdown(node.content);
  });
  return blocks.join("\n\n").trim();
}
