/** Build the public request origin, preferring the inbound Host header. */
export function requestOrigin(request: Request): string {
  const originHeader = request.headers.get("Origin");
  if (originHeader && originHeader !== "null") {
    try {
      const origin = new URL(originHeader);
      if (origin.protocol === "http:" || origin.protocol === "https:") {
        return origin.origin;
      }
    } catch {
      // Fall through to Host headers.
    }
  }

  const url = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    url.host;
  const protocol =
    request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  return `${protocol}://${host}`;
}
