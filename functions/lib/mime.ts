import { CHARSET_BY_MIME, MIME_BY_EXT } from "./mime-map";

const ACTIVE_MIME_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/xml",
  "application/xml",
  "text/css",
  "text/javascript",
  "application/javascript",
  "application/x-javascript",
  "application/ecmascript",
  "text/ecmascript",
]);

const INLINE_APPLICATION_TYPES = new Set([
  "application/json",
  "application/yaml",
  "application/toml",
  "application/sql",
  "application/graphql",
  "application/pdf",
]);

export function baseMime(value: string | null | undefined): string {
  return (value ?? "").split(";")[0].trim().toLowerCase();
}

export function extensionOf(key: string): string {
  const name = key.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function isTextualMime(value: string): boolean {
  const base = baseMime(value);
  return (
    base.startsWith("text/") ||
    base === "image/svg+xml" ||
    base === "application/json" ||
    base === "application/yaml" ||
    base === "application/toml" ||
    base === "application/xml" ||
    Boolean(CHARSET_BY_MIME[base])
  );
}

export function withCharset(value: string): string {
  if (!isTextualMime(value)) return value;
  if (/;\s*charset=/i.test(value)) return value;
  const charset = CHARSET_BY_MIME[baseMime(value)] || "UTF-8";
  return `${value}; charset=${charset}`;
}

function isMediaMime(value: string): boolean {
  return (
    value.startsWith("image/") ||
    value.startsWith("audio/") ||
    value.startsWith("video/")
  );
}

/**
 * Resolve the MIME type used when serving an object.
 *
 * Extension wins for known types (fixes empty/octet-stream metadata), except
 * that an already-stored image/audio/video type wins for ambiguous extensions
 * such as `.ts` (TypeScript source vs MPEG-TS video).
 */
export function resolveMime(
  key: string,
  storedContentType?: string | null
): string {
  const stored = baseMime(storedContentType);
  if (stored === "application/x-directory") return stored;

  if (stored && isMediaMime(stored)) return withCharset(stored);

  const mapped = MIME_BY_EXT[extensionOf(key)];
  if (mapped) return withCharset(mapped);

  if (
    stored &&
    stored !== "application/octet-stream" &&
    stored !== "binary/octet-stream"
  ) {
    return withCharset(stored);
  }

  return "application/octet-stream";
}

export function isInlineSafe(mime: string): boolean {
  const base = baseMime(mime);
  if (ACTIVE_MIME_TYPES.has(base)) return false;
  if (base.startsWith("text/")) return true;
  if (base.startsWith("image/") || base.startsWith("audio/")) return true;
  if (base.startsWith("video/")) return true;
  if (INLINE_APPLICATION_TYPES.has(base)) return true;
  return false;
}

export function filenameFromKey(key: string): string {
  const name = key.split("/").pop();
  return name && name.length > 0 ? name : "download";
}

function encodeRFC5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function contentDisposition(
  key: string,
  mime: string,
  forceDownload = false
): string {
  const filename = filenameFromKey(key);
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const disposition =
    forceDownload || !isInlineSafe(mime) ? "attachment" : "inline";
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeRFC5987(
    filename
  )}`;
}

export interface ByteRange {
  offset: number;
  length: number;
}

/**
 * Parse a single-range `Range: bytes=...` header.
 * Returns null when there is no range, "invalid" when unsatisfiable/unsupported.
 */
export function parseRangeHeader(
  value: string | null,
  size: number
): ByteRange | "invalid" | null {
  if (!value) return null;
  if (!value.toLowerCase().startsWith("bytes=")) return "invalid";
  if (value.includes(",")) return "invalid"; // Multi-range is not supported.

  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (match[1] === "" && match[2] === "")) return "invalid";
  if (size <= 0) return "invalid";

  let start: number;
  let end: number;

  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Number(match[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      return "invalid";
    }
    if (start < 0 || end < start || start >= size) return "invalid";
    end = Math.min(end, size - 1);
  }

  return { offset: start, length: end - start + 1 };
}

export function contentRangeHeader(range: ByteRange, size: number): string {
  return `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`;
}
