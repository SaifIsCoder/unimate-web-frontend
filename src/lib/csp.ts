/**
 * Content-Security-Policy.
 *
 * The access token lives in `localStorage` (the API authenticates via an
 * `Authorization` header and never reads cookies), which means any script that
 * executes on this origin can exfiltrate it. CSP is therefore the primary
 * mitigation, not a nice-to-have.
 *
 * Strategy: per-request nonce plus `strict-dynamic`.
 *  - Only scripts carrying the current nonce may run. Next injects the nonce
 *    into its own bootstrap scripts by reading it back off this header.
 *  - `strict-dynamic` lets those trusted scripts load the chunks they need
 *    without us enumerating every hashed filename.
 *  - Injected `<script>` from a reflected-XSS payload has no nonce, so it is
 *    refused even though it sits on our own origin.
 *
 * TRADE-OFF: a nonce must be unique per response, so pages carrying one cannot
 * be statically prerendered — every route this covers becomes dynamically
 * rendered. That is an acceptable cost here because every page in this app is
 * an authenticated client component that fetches on mount; none of them gained
 * anything from being static.
 */

/** Origin of the UniMate API, which `connect-src` must permit. */
const apiOrigin = (): string => {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";
  try {
    return new URL(configured).origin;
  } catch {
    // A malformed env var must not silently produce a policy that blocks all
    // API traffic with no clue as to why.
    console.warn(
      `[csp] NEXT_PUBLIC_API_BASE_URL is not a valid URL: "${configured}". Falling back to http://localhost:5000`,
    );
    return "http://localhost:5000";
  }
};

/** Cryptographically random, base64-encoded nonce for a single response. */
export const generateNonce = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export const buildCsp = (nonce: string, isDev: boolean): string => {
  const api = apiOrigin();

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],

    // 'unsafe-eval' is required only by the dev-time React Refresh runtime.
    // It is never emitted in a production build.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],

    // Styles keep 'unsafe-inline': React writes `style` attributes directly and
    // Next inlines critical CSS, neither of which can carry a nonce. The risk
    // is far lower than for scripts — CSS injection cannot read localStorage.
    "style-src": ["'self'", "'unsafe-inline'"],

    // next/font self-hosts, so no external font origin is needed.
    "font-src": ["'self'", "data:"],
    "img-src": ["'self'", "data:", "blob:"],

    // XHR/fetch targets: this origin plus the API. Dev additionally needs the
    // websocket the HMR client connects over.
    "connect-src": ["'self'", api, ...(isDev ? ["ws:", "wss:"] : [])],

    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    // Modern equivalent of X-Frame-Options: DENY, which is also still sent for
    // older browsers that ignore this directive.
    "frame-ancestors": ["'none'"],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
  };

  const policy = Object.entries(directives)
    .map(([directive, values]) => `${directive} ${values.join(" ")}`)
    .join("; ");

  // Pointless over plain http in local dev, and it would break the dev server.
  return isDev ? policy : `${policy}; upgrade-insecure-requests`;
};
