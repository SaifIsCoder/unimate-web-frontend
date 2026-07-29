/**
 * Route access map — the single source of truth for who may reach what.
 *
 * Consumed by BOTH `middleware.ts` (edge, pre-render) and `RequireRole`
 * (client, post-hydrate) so the two can never drift. Adding a route in one
 * place is enough.
 *
 * Reminder: neither layer is a security boundary. The API enforces access on
 * every request; these rules exist so users never see a page they cannot use.
 */

export type RouteRule = {
  /** Path prefix this rule governs. */
  prefix: string;
  /** Roles allowed. `super_admin` is implied wherever `admin` appears. */
  roles: readonly string[];
};

/** Reachable without a session. */
export const PUBLIC_PATHS = ["/signin"] as const;

/**
 * Routes that exist in the tree but are deliberately unreachable.
 *
 * `/signup` is boilerplate: the API has no public registration endpoint —
 * accounts are provisioned by an admin via `POST /users` — so exposing a
 * self-registration form is misleading. The remaining entries are the unused
 * template pages, unlinked from navigation but still present on disk.
 */
export const RETIRED_PATHS = [
  "/signup",
  "/alerts",
  "/avatars",
  "/badge",
  "/buttons",
  "/images",
  "/modals",
  "/videos",
  "/blank",
  "/calendar",
  "/basic-tables",
  "/form-elements",
  "/bar-chart",
  "/line-chart",
  "/profile",
] as const;

/** Longest prefix wins, so order here is irrelevant. */
export const ROUTE_RULES: readonly RouteRule[] = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/teacher", roles: ["teacher"] },
  { prefix: "/account", roles: ["admin", "teacher"] },
];

const startsWithSegment = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PATHS.some((p) => startsWithSegment(pathname, p));

export const isRetiredPath = (pathname: string): boolean =>
  RETIRED_PATHS.some((p) => startsWithSegment(pathname, p));

/** The rule governing a path, or null when the path is unguarded. */
export const ruleFor = (pathname: string): RouteRule | null =>
  ROUTE_RULES.filter((rule) => startsWithSegment(pathname, rule.prefix)).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0] ?? null;
