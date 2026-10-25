import { resolveMime } from "./mime";
import {
  encodeKey,
  type FileItem,
  type ShareLink,
} from "./types";

const WEBDAV_ENDPOINT = "/webdav/";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function responseError(response: Response): Promise<ApiError> {
  const text = await response.text().catch(() => "");
  let code: string | undefined;
  try {
    const body = JSON.parse(text) as { error?: string };
    code = body.error;
  } catch {
    // Plain-text error response.
  }
  return new ApiError(
    text || `Request failed with status ${response.status}`,
    response.status,
    code
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function fetchPath(
  path: string,
  signal?: AbortSignal
): Promise<FileItem[]> {
  const response = await fetch(`${WEBDAV_ENDPOINT}${encodeKey(path)}`, {
    method: "PROPFIND",
    headers: { Depth: "1" },
    signal,
  });

  if (!response.ok) throw await responseError(response);
  if (!response.headers.get("Content-Type")?.includes("application/xml")) {
    throw new ApiError("Invalid PROPFIND response", response.status);
  }

  const text = await response.text();
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new ApiError("Invalid PROPFIND XML", response.status);
  }

  const current = path.replace(/\/$/, "");
  const items: FileItem[] = [];

  for (const node of Array.from(document.querySelectorAll("response"))) {
    const hrefText = node.querySelector("href")?.textContent ?? "";
    if (!hrefText) continue;

    let pathname = hrefText;
    try {
      pathname = hrefText.startsWith("http")
        ? new URL(hrefText).pathname
        : hrefText;
    } catch {
      pathname = hrefText;
    }

    const decoded = safeDecode(pathname);
    const key = decoded.startsWith(WEBDAV_ENDPOINT)
      ? decoded.slice(WEBDAV_ENDPOINT.length)
      : decoded.replace(/^\/+/, "");

    if (key.replace(/\/$/, "") === current) continue;

    const contentType =
      node.querySelector("getcontenttype")?.textContent?.trim() || "";
    const sizeText = node.querySelector("getcontentlength")?.textContent;
    const modified =
      node.querySelector("getlastmodified")?.textContent ||
      node.querySelector("creationdate")?.textContent ||
      new Date(0).toUTCString();
    const thumbnail = node.getElementsByTagNameNS(
      "flaredrive",
      "thumbnail"
    )[0]?.textContent;

    items.push({
      key,
      size: sizeText ? Number(sizeText) : 0,
      uploaded: modified,
      httpMetadata: {
        contentType:
          contentType || (key.endsWith("/") ? "application/x-directory" : ""),
      },
      customMetadata: thumbnail ? { thumbnail } : undefined,
    });
  }

  return items;
}

export async function createShareLink(
  path: string,
  expiresIn: number
): Promise<ShareLink> {
  const response = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, expiresIn }),
  });
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as ShareLink;
}

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Name is required";
  if (trimmed === "." || trimmed === "..") return "Invalid name";
  if (/[/\\]/.test(trimmed)) return "Name cannot contain slashes";
  if (trimmed.includes("\0")) return "Invalid name";
  return null;
}

export async function createFolder(cwd: string, name: string): Promise<void> {
  const error = validateName(name);
  if (error) throw new ApiError(error, 400);
  const response = await fetch(
    `${WEBDAV_ENDPOINT}${encodeKey(cwd + name.trim())}`,
    { method: "MKCOL" }
  );
  if (!response.ok) throw await responseError(response);
}

export async function moveKey(
  source: string,
  target: string,
  overwrite = false
): Promise<void> {
  const destination = new URL(
    `${WEBDAV_ENDPOINT}${encodeKey(target)}`,
    window.location.href
  ).href;
  const response = await fetch(`${WEBDAV_ENDPOINT}${encodeKey(source)}`, {
    method: "MOVE",
    headers: {
      Destination: destination,
      Overwrite: overwrite ? "T" : "F",
    },
  });
  if (!response.ok) throw await responseError(response);
}

export async function copyKey(
  source: string,
  target: string,
  overwrite = false
): Promise<void> {
  const destination = new URL(
    `${WEBDAV_ENDPOINT}${encodeKey(target)}`,
    window.location.href
  ).href;
  const response = await fetch(`${WEBDAV_ENDPOINT}${encodeKey(source)}`, {
    method: "COPY",
    headers: {
      Destination: destination,
      Overwrite: overwrite ? "T" : "F",
    },
  });
  if (!response.ok) throw await responseError(response);
}

export async function deleteKeys(keys: string[]): Promise<string[]> {
  const results = await Promise.allSettled(
    keys.map(async (key) => {
      const response = await fetch(`${WEBDAV_ENDPOINT}${encodeKey(key)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw await responseError(response);
      return key;
    })
  );
  const failed: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") failed.push(keys[index]);
  });
  return failed;
}

export async function readTextFile(key: string): Promise<string> {
  const response = await fetch(`${WEBDAV_ENDPOINT}${encodeKey(key)}`);
  if (!response.ok) throw await responseError(response);
  return response.text();
}

export async function writeTextFile(
  key: string,
  content: string
): Promise<void> {
  const response = await fetch(`${WEBDAV_ENDPOINT}${encodeKey(key)}`, {
    method: "PUT",
    headers: { "Content-Type": resolveMime(key, "text/plain") },
    body: content,
  });
  if (!response.ok) throw await responseError(response);
}

export function webdavUrl(key: string): string {
  return `${WEBDAV_ENDPOINT}${encodeKey(key)}`;
}

export function downloadKey(key: string): void {
  const anchor = document.createElement("a");
  anchor.href = webdavUrl(key);
  anchor.download = key.replace(/\/$/, "").split("/").pop() || "download";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return "Authentication required. Refresh the page and sign in to WebDAV.";
      case 403:
        return error.code === "SHARE_NOT_CONFIGURED"
          ? "Share links are not configured. Set SHARE_SECRET in Cloudflare Pages."
          : "Permission denied, or WebDAV is not enabled.";
      case 404:
        return "Not found.";
      case 409:
        return "The parent folder does not exist.";
      case 412:
        return "The target already exists.";
      case 413:
        return "The request is too large.";
      case 429:
        return "Too many requests. Try again later.";
      default:
        return error.message || `Request failed (${error.status}).`;
    }
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
