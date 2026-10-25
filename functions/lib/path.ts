export const INTERNAL_PREFIX = "_$flaredrive$/";

export function decodePath(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Normalize a decoded R2 key for share links.
 *
 * Rejects empty keys, traversal segments, NUL bytes and internal keys; returns
 * the canonical key without leading/trailing slashes.
 */
export function canonicalizeKey(value: string): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > 2048) return null;
  if (value.includes("\0")) return null;

  const key = value.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!key) return null;
  if (key === "." || key === ".." || key.startsWith("../")) return null;
  if (key.startsWith(INTERNAL_PREFIX)) return null;

  const segments = key.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return null;
  }

  return key;
}

export function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}
