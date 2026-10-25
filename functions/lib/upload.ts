import { resolveMime } from "./mime";

/**
 * Clone request headers for R2 httpMetadata, normalizing Content-Type from the
 * object key when the client supplied a missing/generic/wrong value.
 */
export function normalizedHttpMetadata(
  request: Request,
  key: string
): Headers {
  const headers = new Headers(request.headers);
  headers.set("content-type", resolveMime(key, headers.get("content-type")));
  return headers;
}
