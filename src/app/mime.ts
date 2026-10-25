import { CHARSET_BY_MIME, MIME_BY_EXT } from "../shared/mime-map";
import { isDirectory, type FileItem } from "./types";

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

const TEXT_APPLICATION_TYPES = new Set([
  "application/json",
  "application/yaml",
  "application/toml",
  "application/xml",
  "application/sql",
  "application/graphql",
]);

const TEXT_EXTENSIONS = new Set([
  "txt",
  "text",
  "log",
  "md",
  "markdown",
  "yaml",
  "yml",
  "toml",
  "ini",
  "conf",
  "cfg",
  "env",
  "properties",
  "csv",
  "tsv",
  "json",
  "jsonc",
  "json5",
  "xml",
  "html",
  "htm",
  "css",
  "js",
  "mjs",
  "cjs",
  "jsx",
  "ts",
  "tsx",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "bat",
  "cmd",
  "sql",
  "graphql",
  "gql",
  "diff",
  "patch",
  "srt",
  "vtt",
  "tex",
  "ics",
  "ical",
  "vcf",
  "ovpn",
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
    TEXT_APPLICATION_TYPES.has(base) ||
    base === "image/svg+xml" ||
    Boolean(CHARSET_BY_MIME[base])
  );
}

export function withCharset(value: string): string {
  if (!isTextualMime(value)) return value;
  if (/;\s*charset=/i.test(value)) return value;
  const charset = CHARSET_BY_MIME[baseMime(value)] || "UTF-8";
  return `${value}; charset=${charset}`;
}

export function resolveMime(
  key: string,
  storedContentType?: string | null
): string {
  const stored = baseMime(storedContentType);
  if (stored === "application/x-directory") return stored;
  if (
    stored &&
    (stored.startsWith("image/") ||
      stored.startsWith("audio/") ||
      stored.startsWith("video/"))
  ) {
    return withCharset(stored);
  }

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

export function isTextLike(file: FileItem): boolean {
  if (isDirectory(file)) return false;
  const mime = resolveMime(file.key, file.httpMetadata?.contentType);
  const base = baseMime(mime);
  if (base.startsWith("text/") || TEXT_APPLICATION_TYPES.has(base)) return true;
  return TEXT_EXTENSIONS.has(extensionOf(file.key));
}

export type MimeCategory =
  | "folder"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "archive"
  | "calendar"
  | "code"
  | "document"
  | "other";

export function mimeCategory(file: FileItem): MimeCategory {
  if (isDirectory(file)) return "folder";
  const base = baseMime(resolveMime(file.key, file.httpMetadata?.contentType));
  const ext = extensionOf(file.key);
  if (base.startsWith("image/")) return "image";
  if (base.startsWith("video/")) return "video";
  if (base.startsWith("audio/")) return "audio";
  if (base === "application/pdf") return "pdf";
  if (["ics", "ical"].includes(ext) || base === "text/calendar") return "calendar";
  if (
    [
      "zip",
      "tar",
      "gz",
      "tgz",
      "bz2",
      "xz",
      "7z",
      "rar",
      "zst",
    ].includes(ext)
  ) {
    return "archive";
  }
  if (
    base.startsWith("text/") ||
    TEXT_APPLICATION_TYPES.has(base) ||
    TEXT_EXTENSIONS.has(ext)
  ) {
    return "code";
  }
  if (
    [
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "odt",
      "ods",
      "odp",
      "epub",
      "rtf",
    ].includes(ext)
  ) {
    return "document";
  }
  return "other";
}

export function friendlyType(file: FileItem): string {
  if (isDirectory(file)) return "Folder";
  const ext = extensionOf(file.key);
  const labels: Record<string, string> = {
    yaml: "YAML",
    yml: "YAML",
    json: "JSON",
    md: "Markdown",
    markdown: "Markdown",
    toml: "TOML",
    ics: "Calendar",
    ical: "Calendar",
    vcf: "vCard",
    pdf: "PDF",
    png: "PNG",
    jpg: "JPEG",
    jpeg: "JPEG",
    gif: "GIF",
    webp: "WebP",
    svg: "SVG",
    zip: "ZIP",
    gz: "GZip",
    tgz: "Tar GZip",
    tar: "Tar",
    txt: "Text",
    log: "Log",
    csv: "CSV",
    html: "HTML",
    htm: "HTML",
    css: "CSS",
    js: "JavaScript",
    mjs: "JavaScript",
    ts: "TypeScript",
    tsx: "TypeScript",
    jsx: "JavaScript",
    sh: "Shell",
    sql: "SQL",
    xml: "XML",
    woff2: "WOFF2",
    ttf: "TTF",
    otf: "OTF",
    wasm: "WASM",
  };
  if (labels[ext]) return labels[ext];
  if (ext) return ext.length <= 6 ? ext.toUpperCase() : "File";
  return mimeCategory(file) === "other" ? "File" : mimeCategory(file);
}
