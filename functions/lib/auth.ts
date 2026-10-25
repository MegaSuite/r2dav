export interface AuthEnv {
  WEBDAV_USERNAME?: string;
  WEBDAV_PASSWORD?: string;
}

const REALM = "WebDAV";

export function unauthorized(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${REALM}"` },
  });
}

export function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Require the same HTTP Basic credentials as the WebDAV endpoint.
 * Returning null means authentication succeeded.
 */
export function checkBasicAuth(
  request: Request,
  env: AuthEnv
): Response | null {
  if (!env.WEBDAV_USERNAME || !env.WEBDAV_PASSWORD) {
    return new Response("WebDAV protocol is not enabled", { status: 403 });
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) return unauthorized();

  const match = /^Basic\s+(.+)$/i.exec(authorization);
  if (!match) return unauthorized();

  const expected = base64Utf8(
    `${env.WEBDAV_USERNAME}:${env.WEBDAV_PASSWORD}`
  );
  if (!timingSafeEqualString(match[1], expected)) return unauthorized();

  return null;
}

/** Reject cross-site requests that try to create share links with cached auth. */
export function checkSameOrigin(request: Request): Response | null {
  const origin = request.headers.get("Origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      return new Response("Forbidden", { status: 403 });
    }
    const requestHosts = new Set(
      [
        request.headers.get("host"),
        request.headers.get("x-forwarded-host"),
        new URL(request.url).host,
      ]
        .filter((host): host is string => Boolean(host))
        .map((host) => host.toLowerCase())
    );
    if (!requestHosts.has(originHost.toLowerCase())) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  const site = request.headers.get("Sec-Fetch-Site");
  if (site && site !== "same-origin" && site !== "none") {
    return new Response("Forbidden", { status: 403 });
  }

  return null;
}
