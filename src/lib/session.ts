/**
 * Session hint cookie.
 *
 * WHY THIS EXISTS
 * ---------------
 * Next.js middleware runs on the edge and can only read cookies — it cannot see
 * `localStorage`, which is where the access token must live because the UniMate
 * API authenticates via an `Authorization: Bearer` header (it never reads
 * cookies). Without a cookie, middleware cannot make any routing decision, and
 * every protected page renders briefly before the client bounces it.
 *
 * So we write a *credential-free* hint: the role and an expiry. Nothing here can
 * be replayed against the API.
 *
 * SECURITY BOUNDARY — READ THIS BEFORE TRUSTING IT
 * ------------------------------------------------
 * This cookie is **not** a security control. The user can trivially forge it.
 * Doing so gets them a rendered page shell whose every data request then fails
 * with 401/403, because the real boundary is the API's own auth + role
 * middleware. Treat this strictly as a UX optimisation and defence in depth:
 * never gate a secret on it, and never let a component assume it is truthful.
 *
 * Not `httpOnly` by necessity — it is written from client code after login.
 * That is acceptable precisely because it carries no credential.
 */

export const SESSION_COOKIE = "unimate_session";

/** Matches the API's refresh-token lifetime (7 days). */
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export type SessionHint = {
  /** User role as returned by the API. */
  role: string;
  /** Absolute expiry, epoch milliseconds. */
  exp: number;
};

/** Roles permitted to use the dashboard at all. Students belong in the mobile app. */
export const DASHBOARD_ROLES = ["super_admin", "admin", "teacher"] as const;
export type DashboardRole = (typeof DASHBOARD_ROLES)[number];

export const isDashboardRole = (role: string | undefined): role is DashboardRole =>
  !!role && (DASHBOARD_ROLES as readonly string[]).includes(role);

/** `super_admin` inherits `admin`, mirroring the API's `hasRole` helper. */
export const hasRole = (role: string | undefined, allowed: readonly string[]): boolean => {
  if (!role) return false;
  const effective = role === "super_admin" ? [role, "admin"] : [role];
  return allowed.some((candidate) => effective.includes(candidate));
};

/** Landing route for a role. Anything unrecognised goes to sign-in. */
export const homePathForRole = (role: string | undefined): string => {
  if (role === "teacher") return "/teacher";
  if (role === "admin" || role === "super_admin") return "/admin";
  return "/signin";
};

// ── Encoding ─────────────────────────────────────────────────────────────────
// Base64url keeps the value cookie-safe without percent-encoding noise.
//
// TextEncoder/TextDecoder rather than the legacy `escape`/`unescape` pair: both
// of those are deprecated, and they are also the classic source of mojibake on
// non-Latin-1 input. These APIs are available identically in the browser, in
// Node, and in the edge runtime that executes middleware — so one code path
// serves all three.

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (value: string): Uint8Array => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  // atob rejects a string whose length isn't a multiple of 4, and base64url
  // strips the padding, so it has to be restored.
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const encode = (hint: SessionHint): string =>
  toBase64Url(new TextEncoder().encode(JSON.stringify(hint)));

export const decodeSessionHint = (raw: string | undefined): SessionHint | null => {
  if (!raw) return null;

  try {
    // `fatal` makes invalid UTF-8 throw instead of silently yielding U+FFFD,
    // so a corrupt cookie is rejected rather than parsed into nonsense.
    const json = new TextDecoder("utf-8", { fatal: true }).decode(fromBase64Url(raw));

    const parsed = JSON.parse(json) as Partial<SessionHint>;
    if (typeof parsed.role !== "string" || typeof parsed.exp !== "number") return null;
    if (!Number.isFinite(parsed.exp) || parsed.exp <= Date.now()) return null;
    // A role outside the dashboard set (notably `student`) is not a session
    // this app will honour, forged or otherwise.
    if (!isDashboardRole(parsed.role)) return null;

    return { role: parsed.role, exp: parsed.exp };
  } catch {
    // A malformed cookie is treated as "no session" rather than an error —
    // the user simply gets bounced to sign-in.
    return null;
  }
};

// ── Browser-side read/write ──────────────────────────────────────────────────

export const writeSessionHint = (role: string) => {
  if (typeof document === "undefined") return;

  const value = encode({ role, exp: Date.now() + MAX_AGE_SECONDS * 1000 });
  const secure = window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie = `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
};

export const clearSessionHint = () => {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
};

export const readSessionHint = (): SessionHint | null => {
  if (typeof document === "undefined") return null;

  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${SESSION_COOKIE}=`));

  return decodeSessionHint(match?.slice(SESSION_COOKIE.length + 1));
};
