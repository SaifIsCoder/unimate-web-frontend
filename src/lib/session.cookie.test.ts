import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionHint,
  decodeSessionHint,
  readSessionHint,
  SESSION_COOKIE,
  writeSessionHint,
} from "./session";

/**
 * Browser-side cookie helpers.
 *
 * The suite runs in the `node` environment, so `document` and `window` are
 * stubbed by hand — enough surface to exercise the real read/write paths
 * without the cost of jsdom. `document.cookie` is modelled the way browsers
 * behave: assignment appends or replaces one entry; reading returns them joined.
 */

const installDocument = (protocol = "http:") => {
  const jar = new Map<string, string>();

  vi.stubGlobal("document", {
    get cookie() {
      return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
    },
    set cookie(entry: string) {
      const [pair, ...attrs] = entry.split(";").map((part) => part.trim());
      const index = pair.indexOf("=");
      const key = pair.slice(0, index);
      const value = pair.slice(index + 1);

      const expired = attrs.some((attr) => /^max-age=0$/i.test(attr));
      if (expired) jar.delete(key);
      else jar.set(key, value);
    },
  });

  vi.stubGlobal("window", { location: { protocol } });

  return {
    raw: () => jar.get(SESSION_COOKIE),
    attrsOf: (captured: string) => captured.split(";").map((part) => part.trim()),
  };
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("writeSessionHint / readSessionHint", () => {
  it("round-trips a role through the cookie", () => {
    installDocument();

    writeSessionHint("admin");
    const hint = readSessionHint();

    expect(hint?.role).toBe("admin");
    expect(hint?.exp).toBeGreaterThan(Date.now());
  });

  it("sets an expiry roughly matching the API's 7-day refresh token", () => {
    installDocument();
    writeSessionHint("teacher");

    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const hint = readSessionHint();
    // Generous tolerance: this asserts the order of magnitude, not the clock.
    expect(hint!.exp - Date.now()).toBeGreaterThan(sevenDays - 60_000);
    expect(hint!.exp - Date.now()).toBeLessThanOrEqual(sevenDays);
  });

  it("writes a value the edge decoder accepts", () => {
    // Guards the browser-writes / middleware-reads contract end to end.
    const jar = installDocument();
    writeSessionHint("super_admin");

    expect(decodeSessionHint(jar.raw())).toEqual(
      expect.objectContaining({ role: "super_admin" }),
    );
  });

  it("carries SameSite=Lax and Path=/ but not Secure over http", () => {
    const captured: string[] = [];
    vi.stubGlobal("document", {
      get cookie() {
        return "";
      },
      set cookie(entry: string) {
        captured.push(entry);
      },
    });
    vi.stubGlobal("window", { location: { protocol: "http:" } });

    writeSessionHint("admin");

    expect(captured[0]).toContain("SameSite=Lax");
    expect(captured[0]).toContain("Path=/");
    // A Secure cookie would simply be dropped by the browser over plain http,
    // silently breaking local development.
    expect(captured[0]).not.toContain("Secure");
  });

  it("adds Secure when served over https", () => {
    const captured: string[] = [];
    vi.stubGlobal("document", {
      get cookie() {
        return "";
      },
      set cookie(entry: string) {
        captured.push(entry);
      },
    });
    vi.stubGlobal("window", { location: { protocol: "https:" } });

    writeSessionHint("admin");
    expect(captured[0]).toContain("Secure");
  });

  it("overwrites rather than stacking on repeated writes", () => {
    installDocument();

    writeSessionHint("admin");
    writeSessionHint("teacher");

    expect(readSessionHint()?.role).toBe("teacher");
  });
});

describe("clearSessionHint", () => {
  it("removes the cookie so middleware sees no session", () => {
    installDocument();

    writeSessionHint("admin");
    expect(readSessionHint()).not.toBeNull();

    clearSessionHint();
    expect(readSessionHint()).toBeNull();
  });
});

describe("server-side safety", () => {
  it("no-ops without throwing when document is absent", () => {
    // These run during SSR and inside the edge runtime, where there is no
    // document. Throwing would take down the render.
    expect(() => writeSessionHint("admin")).not.toThrow();
    expect(() => clearSessionHint()).not.toThrow();
    expect(readSessionHint()).toBeNull();
  });

  it("returns null when the cookie jar holds no session", () => {
    installDocument();
    expect(readSessionHint()).toBeNull();
  });

  it("ignores unrelated cookies", () => {
    installDocument();
    document.cookie = "theme=dark";
    document.cookie = "other=value";

    expect(readSessionHint()).toBeNull();

    writeSessionHint("admin");
    expect(readSessionHint()?.role).toBe("admin");
  });
});
