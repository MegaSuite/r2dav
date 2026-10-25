import { AuthEnv, checkBasicAuth, checkSameOrigin } from "../lib/auth";
import { requestOrigin } from "../lib/origin";
import { canonicalizeKey, encodeKey } from "../lib/path";
import { getShareSecret, ShareEnv, signPath } from "../lib/share";
import { parseBucketPath } from "../webdav/utils";

interface Env extends AuthEnv, ShareEnv {}

const MAX_EXPIRES_IN = 365 * 24 * 60 * 60;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function normalizeExpiresIn(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return 0;
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(number) || number < 0 || number > MAX_EXPIRES_IN) {
    return null;
  }
  return number;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { Allow: "POST, OPTIONS" },
    });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST, OPTIONS" },
    });
  }

  const authError = checkBasicAuth(request, env);
  if (authError) return authError;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (contentLength > 4096) return json({ error: "PAYLOAD_TOO_LARGE" }, 413);

  let body: { path?: unknown; expiresIn?: unknown } | null = null;
  try {
    body = (await request.json()) as {
      path?: unknown;
      expiresIn?: unknown;
    };
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }

  const key = canonicalizeKey(
    typeof body?.path === "string" ? body.path : ""
  );
  if (!key) return json({ error: "INVALID_PATH" }, 400);

  const [bucket] = parseBucketPath(context);
  if (!bucket) return json({ error: "NO_BUCKET" }, 404);

  const object = await bucket.head(key);
  if (!object) return json({ error: "NOT_FOUND" }, 404);
  if (object.httpMetadata?.contentType === "application/x-directory") {
    return json({ error: "IS_DIRECTORY" }, 400);
  }

  const expiresIn = normalizeExpiresIn(body?.expiresIn);
  if (expiresIn === null) return json({ error: "INVALID_EXPIRES_IN" }, 400);

  const secret = await getShareSecret(env);
  if (!secret) return json({ error: "SHARE_NOT_CONFIGURED" }, 503);

  const expires =
    expiresIn === 0 ? 0 : Math.floor(Date.now() / 1000) + expiresIn;
  const sign = await signPath(key, expires, secret);
  const url = `${requestOrigin(request)}/d/${encodeKey(
    key
  )}?sign=${encodeURIComponent(sign)}`;

  return json({
    url,
    path: key,
    expiresAt: expires === 0 ? null : new Date(expires * 1000).toISOString(),
  });
};
