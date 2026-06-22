// Cookie parsing/serialization + HMAC-signed cookie values. Signing keeps the
// session (the GitHub token) tamper-evident; the value never leaves the Worker
// unsigned. All cookies are Secure + HttpOnly + SameSite=Lax.
import { base64url } from "./util.ts";

export function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get("Cookie") ?? "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

interface CookieOpts {
  maxAge?: number;
  httpOnly?: boolean;
}

export function cookie(name: string, value: string, opts: CookieOpts = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "Secure", "SameSite=Lax"];
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join("; ");
}

export function clearCookie(name: string): string {
  return `${name}=; Path=/; Secure; SameSite=Lax; HttpOnly; Max-Age=0`;
}

export async function signedCookie(
  name: string,
  value: string,
  secret: string,
  maxAge: number,
): Promise<string> {
  const sig = await hmac(secret, value);
  return cookie(name, `${value}.${sig}`, { maxAge });
}

export async function readSignedCookie(raw: string | undefined, secret: string): Promise<string | null> {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot === -1) return null;
  const value = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = await hmac(secret, value);
  return timingSafeEqual(sig, expected) ? value : null;
}

export async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64url(new Uint8Array(sig));
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
