import { canonicalizeKey } from "../lib/path";
import { getShareSecret, verifyPathSign } from "../lib/share";
import { corsResponse, serveObject } from "../lib/serve";
import { parseBucketPath } from "../webdav/utils";

interface Env {
  SHARE_SECRET?: string;
  WEBDAV_PASSWORD?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return corsResponse(null, { status: 204 });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return corsResponse("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD, OPTIONS" },
    });
  }

  const [bucket, decodedPath] = parseBucketPath(context);
  if (!bucket) return corsResponse("Not found", { status: 404 });

  const key = canonicalizeKey(decodedPath);
  if (!key) return corsResponse("Bad Request", { status: 400 });

  const sign = new URL(request.url).searchParams.get("sign");
  if (!sign) return corsResponse("Unauthorized", { status: 401 });

  const secret = await getShareSecret(context.env);
  if (!secret) {
    return corsResponse("Share links are not configured", { status: 503 });
  }

  const verified = await verifyPathSign(key, sign, secret);
  if (!verified.ok) {
    return corsResponse(verified.expired ? "Link expired" : "Unauthorized", {
      status: verified.expired ? 410 : 401,
    });
  }

  const response = await serveObject({
    request,
    bucket,
    key,
    method: request.method as "GET" | "HEAD",
    cors: true,
    disposition: true,
    cacheControl: "private, max-age=60, must-revalidate",
  });

  return response ?? corsResponse("Not found", { status: 404 });
};
