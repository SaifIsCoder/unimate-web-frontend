import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decodeSessionHint, hasRole, homePathForRole, SESSION_COOKIE } from "@/lib/session";
import { isPublicPath, isRetiredPath, ruleFor } from "@/lib/routes";
import { buildCsp, generateNonce } from "@/lib/csp";

/**
 * Edge route gating and security headers.
 *
 * Named `proxy` in the file `proxy.ts`: Next 16 renamed the `middleware`
 * convention, which now emits a deprecation warning and is slated for removal.
 *
 * Runs before any page renders, so an unauthenticated deep link redirects
 * without ever flashing protected chrome. It reads only the credential-free
 * session hint cookie (see `lib/session.ts`) — the API remains the real
 * authorisation boundary, and `RequireRole` still guards the client tree in
 * case the cookie is stale or forged.
 */

const isDev = process.env.NODE_ENV !== "production";

/** Headers applied to every response this middleware returns. */
const applySecurityHeaders = (response: NextResponse, csp: string): NextResponse => {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  // Retained alongside CSP's frame-ancestors for browsers that predate CSP3.
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
};

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const nonce = generateNonce();
  const csp = buildCsp(nonce, isDev);

  const redirect = (to: string, search = "") => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = search;
    return applySecurityHeaders(NextResponse.redirect(url), csp);
  };

  /**
   * Forwards the nonce to the renderer. Next reads `x-nonce` off the request
   * and stamps it onto its own inline bootstrap scripts — without this the
   * policy above would block Next's own JavaScript.
   */
  const proceed = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);

    return applySecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      csp,
    );
  };

  const session = decodeSessionHint(request.cookies.get(SESSION_COOKIE)?.value);

  // Template routes that were never wired to the API. Bounce rather than 404 so
  // a stale bookmark lands somewhere useful.
  if (isRetiredPath(pathname)) {
    return redirect(session ? homePathForRole(session.role) : "/signin");
  }

  // Signed-in users have no reason to see the login screen.
  if (isPublicPath(pathname)) {
    if (session) return redirect(homePathForRole(session.role));
    return proceed();
  }

  // Root resolves to whichever workspace the role belongs in.
  if (pathname === "/") {
    return redirect(session ? homePathForRole(session.role) : "/signin");
  }

  const rule = ruleFor(pathname);
  if (!rule) return proceed();

  // Unauthenticated: send to sign-in, preserving the intended destination.
  if (!session) {
    return redirect("/signin", `?next=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`);
  }

  // Authenticated but wrong workspace: redirect to their own home rather than
  // showing a dead end.
  if (!hasRole(session.role, rule.roles)) {
    return redirect(homePathForRole(session.role));
  }

  return proceed();
}

export const config = {
  /**
   * Everything except Next internals and static assets. Keeping static files
   * out of the matcher matters for performance — middleware would otherwise run
   * on every image and font request.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
