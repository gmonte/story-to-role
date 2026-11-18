// The agent sees each line with a short id; one that slips into a reply is
// noise to the user, so it never shows.
export function withoutLineIds(text: string) {
  return text.replace(/\s?[[(][0-9a-f]{8}[\])]/g, "");
}
