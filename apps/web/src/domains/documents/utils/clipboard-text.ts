/**
 * The copied blocks as plain text: a bullet starts with an explicit “• ”
 * (the editor only draws it), so a LinkedIn experience pasted elsewhere
 * keeps its bullets. Bullets in a row go one per line; other blocks are
 * apart by a blank line. Part of a single line copies as it is.
 */
export function clipboardText(
  blocks: Array<{ bullet: boolean; text: string }>,
  partOfOneLine: boolean
) {
  if (partOfOneLine) return blocks.map((block) => block.text).join("");
  return blocks
    .map((block, index) => {
      const text = block.bullet ? `• ${block.text}` : block.text;
      if (index === 0) return text;
      return (block.bullet && blocks[index - 1]?.bullet ? "\n" : "\n\n") + text;
    })
    .join("");
}
