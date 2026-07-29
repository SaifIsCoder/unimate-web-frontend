import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decodeSessionHint, hasRole, homePathForRole, SESSION_COOKIE } from "@/lib/session";
import { isPublicPath, isRetiredPath, ruleFor } from "@/lib/routes";

/**
 * Edge route gating.
 *
 * Runs before any page renders, so an unauthenticated deep link redirects
 * without ever flashing protected chrome. It reads only the credential-free
 * session hint cookie (see `lib/session.ts`) — the API remains the real
 * authorisation boundary, and `RequireRole` still guards the client tree in
 * case the cookie is stale or forged.
 */

/** Security headers applied to every HTML response. */
const applySecurityHeaders = (response: NextResponse): NextResponse => {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
};

const redirect = (request: NextRequest, pathname: string, search = "") => {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = search;
  return applySecurityHeaders(NextResponse.redirect(url));
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = decodeSessionHint(request.cookies.get(SESSION_COOKIE)?.value);

  // Template routes that were never wired to the API. Bounce rather than 404 so
  // a stale bookmark lands somewhere useful.
  if (isRetiredPath(pathname)) {
    return redirect(request, session ? homePathForRole(session.role) : "/signin");
  }

  // Signed-in users have no reason to see the login screen.
  if (isPublicPath(pathname)) {
    if (session) return redirect(request, homePathForRole(session.role));
    return applySecurityHeaders(NextResponse.next());
  }

  // Root resolves to whichever workspace the role belongs in.
  if (pathname === "/") {
    return redirect(request, session ? homePathForRole(session.role) : "/signin");
  }

  const rule = ruleFor(pathname);
  if (!rule) return applySecurityHeaders(NextResponse.next());

  // Unauthenticated: send to sign-in, preserving the intended destination.
  if (!session) {
    const next = `${pathname}${request.nextUrl.search}`;
    return redirect(request, "/signin", `?next=${encodeURIComponent(next)}`);
  }

  // Authenticated but wrong workspace: redirect to their own home rather than
  // showing a dead end.
  if (!hasRole(session.role, rule.roles)) {
    return redirect(request, homePathForRole(session.role));
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  /**
   * Everything except Next internals, the API proxy and static assets. Keeping
   * static files out of the matcher matters for performance — middleware would
   * otherwise run on every image and font request.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
