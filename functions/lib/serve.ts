import {
  ByteRange,
  contentDisposition,
  contentRangeHeader,
  parseRangeHeader,
  resolveMime,
} from "./mime";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, If-None-Match, If-Modified-Since",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Type, Content-Range, Accept-Ranges, ETag, Last-Modified, Content-Disposition",
  "Access-Control-Max-Age": "86400",
};

export function addCors(headers: Headers): Headers {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return headers;
}

export function corsResponse(
  body: BodyInit | null,
  init: ResponseInit = {}
): Response {
  const headers = addCors(new Headers(init.headers));
  return new Response(body, { ...init, headers });
}

function etagMatches(header: string, etag: string): boolean {
  if (header.trim() === "*") return true;
  const normalized = etag.replace(/^W\//, "");
  return header
    .split(",")
    .map((value) => value.trim().replace(/^W\//, ""))
    .includes(normalized);
}

export interface ServeObjectOptions {
  request: Request;
  bucket: R2Bucket;
  key: string;
  method: "GET" | "HEAD";
  cors?: boolean;
  disposition?: boolean;
  cacheControl?: string;
}

/**
 * Serve an R2 object with correct MIME, ranges, ETag and conditional headers.
 * Returns null when the key does not exist or is a directory.
 */
export async function serveObject({
  request,
  bucket,
  key,
  method,
  cors = false,
  disposition = false,
  cacheControl,
}: ServeObjectOptions): Promise<Response | null> {
  const head = await bucket.head(key);
  if (!head) return null;
  if (head.httpMetadata?.contentType === "application/x-directory") return null;

  const mime = resolveMime(key, head.httpMetadata?.contentType);
  const headers = new Headers();
  headers.set("Content-Type", mime);
  headers.set("ETag", head.httpEtag);
  headers.set("Last-Modified", head.uploaded.toUTCString());
  headers.set("Accept-Ranges", "bytes");
  if (cacheControl) headers.set("Cache-Control", cacheControl);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  if (disposition) {
    const download = new URL(request.url).searchParams.get("download");
    headers.set(
      "Content-Disposition",
      contentDisposition(key, mime, download === "1" || download === "true")
    );
  }
  if (cors) addCors(headers);

  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch && etagMatches(ifNoneMatch, head.httpEtag)) {
    return new Response(null, { status: 304, headers });
  }

  if (!ifNoneMatch) {
    const ifModifiedSince = request.headers.get("If-Modified-Since");
    if (ifModifiedSince) {
      const since = Date.parse(ifModifiedSince);
      if (
        Number.isFinite(since) &&
        Math.floor(head.uploaded.getTime() / 1000) <= Math.floor(since / 1000)
      ) {
        return new Response(null, { status: 304, headers });
      }
    }
  }

  if (method === "HEAD") {
    headers.set("Content-Length", head.size.toString());
    return new Response(null, { status: 200, headers });
  }

  const range = parseRangeHeader(request.headers.get("Range"), head.size);
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${head.size}`);
    return new Response("Range Not Satisfiable", { status: 416, headers });
  }

  const object = await bucket.get(
    key,
    range
      ? { range: { offset: range.offset, length: range.length } }
      : undefined
  );
  if (!object || !("body" in object)) return null;

  if (range) {
    applyRangeHeaders(headers, range, head.size);
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("Content-Length", head.size.toString());
  return new Response(object.body, { status: 200, headers });
}

export function applyRangeHeaders(
  headers: Headers,
  range: ByteRange,
  size: number
): void {
  headers.set("Content-Range", contentRangeHeader(range, size));
  headers.set("Content-Length", range.length.toString());
}
