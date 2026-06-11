export function isServerRuntime() {
  return typeof window === "undefined";
}
