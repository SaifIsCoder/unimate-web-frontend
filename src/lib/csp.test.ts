import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The CSP is the primary XSS mitigation for this app, because the access token
 * lives in localStorage. A mistake here either breaks every API call or
 * silently removes the protection, and neither is obvious by eye.
 *
 * `buildCsp` reads NEXT_PUBLIC_API_BASE_URL at call time, so each test imports
 * the module fresh after setting the env.
 */

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_API_BASE_URL;

/** Parses a policy string into directive -> values. */
const parse = (policy: string): Record<string, string[]> =>
  Object.fromEntries(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [directive, ...values] = part.split(/\s+/);
        return [directive, values];
      }),
  );

const load = async () => {
  vi.resetModules();
  return import("./csp");
};

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = ORIGINAL_ENV;
  vi.restoreAllMocks();
});

describe("generateNonce", () => {
  it("produces a fresh value every call", async () => {
    const { generateNonce } = await load();
    const nonces = new Set(Array.from({ length: 100 }, () => generateNonce()));
    // A repeat would let an attacker reuse a captured nonce.
    expect(nonces.size).toBe(100);
  });

  it("produces valid base64 of 16 random bytes", async () => {
    const { generateNonce } = await load();
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(atob(nonce)).toHaveLength(16);
  });
});

describe("buildCsp — script execution", () => {
  it("carries the nonce and strict-dynamic", async () => {
    const { buildCsp } = await load();
    const scriptSrc = parse(buildCsp("TESTNONCE", false))["script-src"];

    expect(scriptSrc).toContain("'nonce-TESTNONCE'");
    expect(scriptSrc).toContain("'strict-dynamic'");
  });

  it("never allows unsafe-inline scripts", async () => {
    const { buildCsp } = await load();
    // 'unsafe-inline' in script-src would defeat the entire policy.
    for (const dev of [true, false]) {
      expect(parse(buildCsp("n", dev))["script-src"]).not.toContain("'unsafe-inline'");
    }
  });

  it("allows unsafe-eval only in development", async () => {
    const { buildCsp } = await load();
    expect(parse(buildCsp("n", true))["script-src"]).toContain("'unsafe-eval'");
    expect(parse(buildCsp("n", false))["script-src"]).not.toContain("'unsafe-eval'");
  });
});

describe("buildCsp — connect-src must reach the API", () => {
  it("includes the configured API origin", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.unimate.edu";
    const { buildCsp } = await load();

    expect(parse(buildCsp("n", false))["connect-src"]).toContain("https://api.unimate.edu");
  });

  it("reduces a URL with a path to its origin", async () => {
    // A directive value with a path would be invalid and block every request.
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.unimate.edu/api/v1";
    const { buildCsp } = await load();

    const connectSrc = parse(buildCsp("n", false))["connect-src"];
    expect(connectSrc).toContain("https://api.unimate.edu");
    expect(connectSrc).not.toContain("https://api.unimate.edu/api/v1");
  });

  it("defaults to localhost:5000, matching the server's default PORT", async () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    const { buildCsp } = await load();

    expect(parse(buildCsp("n", false))["connect-src"]).toContain("http://localhost:5000");
  });

  it("falls back and warns when the env var is malformed", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "not a url";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { buildCsp } = await load();

    expect(parse(buildCsp("n", false))["connect-src"]).toContain("http://localhost:5000");
    expect(warn).toHaveBeenCalled();
  });

  it("permits websockets in dev only, for HMR", async () => {
    const { buildCsp } = await load();
    expect(parse(buildCsp("n", true))["connect-src"]).toContain("ws:");
    expect(parse(buildCsp("n", false))["connect-src"]).not.toContain("ws:");
  });
});

describe("buildCsp — hardening directives", () => {
  it("locks down the dangerous defaults", async () => {
    const { buildCsp } = await load();
    const directives = parse(buildCsp("n", false));

    expect(directives["object-src"]).toEqual(["'none'"]);
    expect(directives["frame-ancestors"]).toEqual(["'none'"]);
    expect(directives["base-uri"]).toEqual(["'self'"]);
    expect(directives["form-action"]).toEqual(["'self'"]);
    expect(directives["default-src"]).toEqual(["'self'"]);
  });

  it("allows inline styles but documents the narrower risk", async () => {
    const { buildCsp } = await load();
    // React writes style attributes and Next inlines critical CSS; neither can
    // carry a nonce. CSS injection cannot read localStorage.
    expect(parse(buildCsp("n", false))["style-src"]).toContain("'unsafe-inline'");
  });

  it("upgrades insecure requests in production only", async () => {
    const { buildCsp } = await load();
    expect(buildCsp("n", false)).toContain("upgrade-insecure-requests");
    // Would break the plain-http dev server.
    expect(buildCsp("n", true)).not.toContain("upgrade-insecure-requests");
  });

  it("emits a syntactically well-formed policy", async () => {
    const { buildCsp } = await load();
    const policy = buildCsp("abc123", false);

    expect(policy).not.toMatch(/;\s*;/);
    for (const [directive, values] of Object.entries(parse(policy))) {
      expect(directive).toMatch(/^[a-z-]+$/);
      if (directive !== "upgrade-insecure-requests") {
        expect(values.length).toBeGreaterThan(0);
      }
    }
  });
});
