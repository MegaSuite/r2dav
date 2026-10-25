import { timingSafeEqualString } from "./auth";

export interface ShareEnv {
  SHARE_SECRET?: string;
  WEBDAV_PASSWORD?: string;
}

const FALLBACK_PREFIX = "r2dav-share-v1:";

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return new Uint8Array(digest);
}

export async function getShareSecret(
  env: ShareEnv
): Promise<Uint8Array | null> {
  if (env.SHARE_SECRET) return new TextEncoder().encode(env.SHARE_SECRET);
  if (env.WEBDAV_PASSWORD) return sha256(FALLBACK_PREFIX + env.WEBDAV_PASSWORD);
  return null;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_");
}

async function hmac(
  secret: Uint8Array,
  payload: string
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return new Uint8Array(signature);
}

/**
 * AList-compatible capability token:
 *   sign = base64url(HMAC-SHA256(secret, path + ":" + expires)) + ":" + expires
 * expires === 0 means never expires.
 */
export async function signPath(
  path: string,
  expires: number,
  secret: Uint8Array
): Promise<string> {
  const signature = await hmac(secret, `${path}:${expires}`);
  return `${base64Url(signature)}:${expires}`;
}

export type VerifyResult =
  | { ok: true; expires: number }
  | { ok: false; expired: boolean };

export async function verifyPathSign(
  path: string,
  sign: string,
  secret: Uint8Array
): Promise<VerifyResult> {
  const separator = sign.lastIndexOf(":");
  if (separator <= 0) return { ok: false, expired: false };

  const signature = sign.slice(0, separator);
  const expiresText = sign.slice(separator + 1);
  if (!/^\d+$/.test(expiresText)) return { ok: false, expired: false };

  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires)) return { ok: false, expired: false };

  const now = Math.floor(Date.now() / 1000);
  if (expires !== 0 && expires < now) return { ok: false, expired: true };

  const expected = await signPath(path, expires, secret);
  if (!timingSafeEqualString(signature, expected.slice(0, expected.lastIndexOf(":")))) {
    return { ok: false, expired: false };
  }

  return { ok: true, expires };
}
