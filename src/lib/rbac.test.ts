import { describe, expect, it } from "vitest";
import { isPublicPath, isRetiredPath, PUBLIC_PATHS, RETIRED_PATHS, ruleFor } from "./routes";
import { hasRole } from "./session";
import { navigationFor, navigationForRole } from "./navigation";

/**
 * Access-control behaviour for the route table and the navigation derived from
 * it. These are the rules `middleware.ts` and `RequireRole` both consume, so a
 * regression here silently changes who can reach what.
 */

/** The decision middleware makes: allow, or redirect somewhere. */
const decide = (pathname: string, role: string | undefined) => {
  if (isRetiredPath(pathname)) return "redirect";
  if (isPublicPath(pathname)) return role ? "redirect" : "allow";

  const rule = ruleFor(pathname);
  if (!rule) return "allow";
  if (!role) return "redirect";
  return hasRole(role, rule.roles) ? "allow" : "redirect";
};

describe("ruleFor — longest prefix wins", () => {
  it("maps workspace roots to their owning role", () => {
    expect(ruleFor("/admin")?.roles).toEqual(["admin"]);
    expect(ruleFor("/teacher")?.roles).toEqual(["teacher"]);
    expect(ruleFor("/profile")?.roles).toEqual(["admin", "teacher"]);
  });

  it("applies a rule to nested paths", () => {
    expect(ruleFor("/admin/users")?.prefix).toBe("/admin");
    expect(ruleFor("/teacher/classes/abc-123")?.prefix).toBe("/teacher");
  });

  it("does not treat a shared word-prefix as a match", () => {
    // "/administrator" must not inherit the "/admin" rule.
    expect(ruleFor("/administrator")).toBeNull();
    expect(ruleFor("/teachers")).toBeNull();
  });

  it("returns null for unguarded paths", () => {
    expect(ruleFor("/signin")).toBeNull();
    expect(ruleFor("/some/unknown/page")).toBeNull();
  });
});

describe("retired and public paths", () => {
  it("flags every retired route, including nested children", () => {
    for (const path of RETIRED_PATHS) expect(isRetiredPath(path)).toBe(true);
    expect(isRetiredPath("/calendar/2026")).toBe(true);
  });

  it("does NOT retire /profile — it is now the live shared profile route", () => {
    // Guards the /account -> /profile move: if /profile crept back into
    // RETIRED_PATHS, middleware would redirect the real page away.
    expect(isRetiredPath("/profile")).toBe(false);
    expect(ruleFor("/profile")).not.toBeNull();
  });

  it("retires /signup — the API has no public registration", () => {
    expect(isRetiredPath("/signup")).toBe(true);
  });

  it("does not retire live routes", () => {
    for (const path of ["/admin", "/teacher", "/profile", "/signin"]) {
      expect(isRetiredPath(path)).toBe(false);
    }
  });

  it("treats only /signin as public", () => {
    expect(PUBLIC_PATHS).toEqual(["/signin"]);
    expect(isPublicPath("/signin")).toBe(true);
    expect(isPublicPath("/admin")).toBe(false);
  });
});

describe("the route access matrix", () => {
  const matrix: Array<[string | undefined, string, "allow" | "redirect"]> = [
    // anonymous — every guarded route bounces, sign-in renders
    [undefined, "/admin", "redirect"],
    [undefined, "/admin/users", "redirect"],
    [undefined, "/teacher", "redirect"],
    [undefined, "/profile", "redirect"],
    [undefined, "/signin", "allow"],

    // teacher — own workspace and the shared profile only
    ["teacher", "/teacher", "allow"],
    ["teacher", "/teacher/classes/abc", "allow"],
    ["teacher", "/profile", "allow"],
    ["teacher", "/admin", "redirect"],
    ["teacher", "/admin/users", "redirect"],
    ["teacher", "/signin", "redirect"],

    // admin — admin workspace, not the teacher one
    ["admin", "/admin", "allow"],
    ["admin", "/admin/courses", "allow"],
    ["admin", "/profile", "allow"],
    ["admin", "/teacher", "redirect"],

    // super_admin — inherits admin, still not a teacher
    ["super_admin", "/admin", "allow"],
    ["super_admin", "/admin/users", "allow"],
    ["super_admin", "/profile", "allow"],
    ["super_admin", "/teacher", "redirect"],

    // student — has no dashboard surface at all
    ["student", "/admin", "redirect"],
    ["student", "/teacher", "redirect"],
    ["student", "/profile", "redirect"],
  ];

  it.each(matrix)("%s visiting %s -> %s", (role, path, expected) => {
    expect(decide(path, role)).toBe(expected);
  });
});

describe("navigation reflects the same permissions", () => {
  const linksFor = (role: string | undefined) =>
    navigationForRole(role).flatMap((section) =>
      section.items.flatMap((item) => [
        ...(item.path ? [item.path] : []),
        ...(item.subItems?.map((sub) => sub.path) ?? []),
      ]),
    );

  it("shows a teacher only their own routes", () => {
    const links = linksFor("teacher");
    expect(links).toContain("/teacher");
    expect(links).toContain("/profile");
    expect(links.some((path) => path.startsWith("/admin"))).toBe(false);
  });

  it("shows an admin the admin routes and not the teacher workspace", () => {
    const links = linksFor("admin");
    expect(links).toContain("/admin");
    expect(links).toContain("/admin/users");
    expect(links).toContain("/admin/courses");
    expect(links).not.toContain("/teacher");
  });

  it("gives super_admin everything an admin sees", () => {
    expect(new Set(linksFor("super_admin"))).toEqual(new Set(linksFor("admin")));
  });

  it("shows nothing to signed-out or student users", () => {
    expect(linksFor(undefined)).toHaveLength(0);
    expect(linksFor("student")).toHaveLength(0);
  });

  it("never links a route the access matrix would redirect", () => {
    // The guarantee that matters: if it is in the sidebar, clicking it works.
    for (const role of ["teacher", "admin", "super_admin"]) {
      for (const path of linksFor(role)) {
        expect(decide(path, role)).toBe("allow");
      }
    }
  });

  it("drops empty sections rather than rendering orphan headings", () => {
    for (const role of ["teacher", "admin", "super_admin"]) {
      for (const section of navigationForRole(role)) {
        expect(section.items.length).toBeGreaterThan(0);
      }
    }
  });

  it("navigationFor honours the injected permission predicate", () => {
    // This is the seam the sidebar uses via `can()` from useAuth.
    const denyAll = navigationFor(() => false);
    expect(denyAll).toHaveLength(0);

    const allowAll = navigationFor(() => true);
    expect(allowAll.length).toBeGreaterThan(0);
  });
});
