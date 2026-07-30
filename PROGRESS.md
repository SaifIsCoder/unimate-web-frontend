# UniMate Dashboard — Delivery Progress

Running record of the phased build described in `dashboard_architecture_plan.md`.
Updated at the end of every phase. Each entry states what shipped, how it was
verified, and what was deliberately left out.

**Backend surface reachable from the dashboard: 51 / 134 endpoints (38%).**
Phase 1 changed no endpoint coverage — it was foundation work.

| Phase | Scope | Status |
| :--- | :--- | :--- |
| 0 | Auth, RBAC route groups, admin CRUD, teacher class workspace | ✅ Complete (pre-existing) |
| **1** | **Harden the foundation** | **✅ Complete — 2026-07-29** |
| **1.1** | **Cleanup pass — boilerplate, CSP, error boundaries, tests** | **✅ Complete — 2026-07-29** |
| **1.2** | **Phase 1 close-out — boilerplate deleted, /profile, deps pruned** | **✅ Complete — 2026-07-29** |
| 2 | Complete admin foundations (Departments, Student Directory, Faculty Roster, Admin Directory) | ⬜ Not started |
| 3 | Master Timetable (schedules + exceptions) | ⬜ Not started |
| 4 | Assignments & Tasks (11 endpoints) | ⬜ Not started |
| 5 | Complete the gradebook (transcripts, weights, attendance reporting) | ⬜ Not started |
| 6 | Communications & community (needs BE-1 for moderation) | ⬜ Blocked in part |
| 7 | Analytics & polish (needs BE-4, BE-5) | ⬜ Blocked |

---

## Phase 1 — Harden the Foundation ✅

**Branch:** `feat/dashboard-phase-1` · **Baseline:** `main` @ *baseline existing dashboard work before Phase 1*

Goal: remove the debt that would compound across six more phases, and close the
gap between "the UI hides it" and "the user cannot reach it".

### Shipped

**1. Edge route gating — `src/middleware.ts`**

Protected routes previously rendered for a moment before the client bounced an
unauthenticated user. Middleware now resolves this before any HTML is produced.

Next middleware runs on the edge and can only read cookies, but the access token
must stay in `localStorage` because the API authenticates via an
`Authorization: Bearer` header and never reads cookies. The bridge is a
**credential-free session hint cookie** (`unimate_session`) carrying only
`{ role, exp }`.

> **This cookie is not a security control.** It is trivially forgeable. Forging
> it yields a rendered page shell whose every data request then fails 401/403,
> because the API authorises independently on each call. It exists to remove the
> flash and route users sensibly — nothing more. `RequireRole` remains as the
> second layer for stale or forged hints.

**2. Route access as data — `src/lib/routes.ts`**

`middleware.ts` and `RequireRole` now read the same rule table, so the edge and
the client can never disagree about who may go where. Adding a route is one
entry.

**3. Retired dead routes**

`/signup` was a boilerplate form wired to nothing — the API has **no public
registration**; accounts are provisioned by an admin via `POST /users`. Leaving
a self-registration screen reachable was misleading. It and the 13 unused
template routes now redirect instead of rendering.

*Per your instruction the files remain on disk, unlinked rather than deleted.*
Trade-off to revisit: they still ship JS bundles and appear in `next build`
output. Deleting `src/app/(admin)/(ui-elements)` and
`src/app/(admin)/(others-pages)` plus the 7 orphaned component folders would
remove ~14 routes from the bundle. Now that git history exists, that deletion is
safely reversible.

**4. Security headers**

Every HTML response carries `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`X-DNS-Prefetch-Control: off`, and a `Permissions-Policy` denying camera,
microphone and geolocation.

**5. Hardened API client — `src/services/apiClient.ts`**

| Failure | Before | After |
| :--- | :--- | :--- |
| 429 rate limit | generic "Request failed" | explicit message, parses `Retry-After` |
| Offline / DNS / CORS | raw `TypeError` escaped to the UI | `ApiError` with `status: 0`, `isNetwork` |
| Hung request | waited forever | aborts at 20s with a clear message |
| 5xx | leaked server text | "The server ran into a problem." |
| Refresh while offline | signed the user out | keeps the session, surfaces a network error |

`ApiError` now exposes `isNetwork`, `isForbidden`, `isRateLimited`,
`isNotFound`, `isValidation` so call sites branch on intent, not status codes.
The 429 path matters in normal use: the API allows **100 requests / 15 min per
IP**, and **5 login attempts / 15 min**.

**6. Role hierarchy fixed**

`RequireRole` compared roles with `Array.includes`, so a `super_admin` would
have been rejected from an `admin`-only subtree. It now uses `hasRole`, which
mirrors the API's own `hasRole` (`super_admin` inherits `admin`). Previously
masked only because every call site listed both roles by hand.

**7. Navigation as data — `src/lib/navigation.tsx`**

One role-filtered declaration drives the sidebar; unauthorised links cannot
render for the wrong actor. Sidebar highlighting now uses longest-prefix match,
so `/teacher/classes/<id>` highlights *My Classes* without `/admin` matching
every `/admin/*` page.

**8. Account page — `/account`**

First real profile screen, reading the role-shaped `GET /auth/me` (the API
branches per role, so the client discriminates on `employeeId` / `adminId`).
Admins additionally load `GET /admins/me` for department context, degrading
quietly when absent.

The password section is **informational by design**. `/auth/reset-password` and
`/auth/set-password` reject admins outright (403) and, for teachers, work
**exactly once** — `password_changed` locks them out with "Contact an admin".
There is no repeatable authenticated change-password endpoint. A form that
mostly 403s is worse than an honest explanation. Tracked as **BE-6**.

**9. Deep-link preservation**

Middleware appends `?next=` when intercepting; sign-in returns the user there.
The destination is validated as a same-origin relative path the role can
actually reach — an absolute URL would be an open redirect, and an unauthorised
path would just bounce again.

### Verified

- `tsc --noEmit` — clean
- `eslint` on all 14 Phase 1 files — clean (3 pre-existing errors remain in
  untouched boilerplate: `calendar`, `ecommerce/StatisticsChart`, `ThemeContext`)
- `next build` — succeeds, middleware registered
- **Runtime behaviour, against a production server on :3999**

| Session | `/` | `/admin` | `/teacher` | `/account` | `/signin` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| anonymous | → signin | → `signin?next=/admin` | → `signin?next=/teacher` | → signin | 200 |
| teacher | → `/teacher` | → `/teacher` | 200 | 200 | → `/teacher` |
| admin | → `/admin` | 200 | → `/admin` | 200 | → `/admin` |
| super_admin | → `/admin` | 200 | → `/admin` | — | — |

Rejected session shapes, all falling back to sign-in: **expired** `exp`,
**student** role, **malformed** cookie. Retired paths (`/signup`, `/calendar`,
`/profile`, `/modals`) redirect rather than render. All five security headers
confirmed present on the response.

### Deliberately not done

- **Boilerplate deletion** — per your decision; see the trade-off above.
- **Self-service password change** — blocked on BE-6.
- **Dark/light and responsive audit** — deferred to Phase 7 polish.

### Files

```
added     src/proxy.ts               (renamed from middleware.ts in 1.2)
added     src/lib/session.ts          session hint + role helpers
added     src/lib/routes.ts           route access table
added     src/lib/navigation.tsx      role-filtered nav config
added     src/services/profileService.ts
added     src/app/(admin)/account/page.tsx
modified  src/services/apiClient.ts   429 / network / timeout / typed errors
modified  src/services/authService.ts session hint on login
modified  src/context/AuthContext.tsx can(), hint re-assert, memoised value
modified  src/components/auth/RequireRole.tsx    hasRole hierarchy
modified  src/components/auth/SignInForm.tsx     ?next= handling
modified  src/components/header/UserDropdown.tsx 3 dead links → 1 real link
modified  src/layout/AppSidebar.tsx              renders nav config
modified  src/app/(full-width-pages)/(auth)/signin/page.tsx  Suspense boundary
```

### Carried into Phase 2

- Sidebar gains Departments, Student Directory, Faculty Roster, Admin Directory
  as those pages land — one entry each in `lib/navigation.tsx`.
- `/account` gains editable fields if BE-6 ships.
- Consider deleting the retired boilerplate now that git history exists.

---

## Phase 1.1 — Cleanup Pass ✅

Closed the nine items found auditing Phase 1: leftover boilerplate that lied to
users, missing Next fundamentals, and no test coverage over the access-control
logic Phase 2 is about to refactor.

### Group 1 — UI that lied to users

| Removed | Why it mattered |
| :--- | :--- |
| `SidebarWidget` | Rendered a third-party ad — *"#1 Tailwind CSS Dashboard"* with an **"Upgrade To Pro"** button linking to `tailadmin.com/pricing` — on every page for every user. |
| `NotificationDropdown` body | ~300 lines of hardcoded fake notifications behind a dead "View All" link. Replaced with an honest empty state. The pulsing unread dot went too: an indicator with no data behind it is the same lie in smaller form. |
| Header search | "Search or type command…" searched nothing. Removed with its dead ⌘K handler and now-unused `useRef`/`useEffect`. |

`SidebarWidget.tsx` is now unreferenced and can be deleted whenever you want.

### Group 2 — Next.js fundamentals

- **Titles.** Root layout now exports `metadata` with `title.default` and
  `title.template: "%s | UniMate Dashboard"`. Tabs previously showed raw URLs.
  Also `robots: noindex` — this is an authenticated internal tool.
  *Per-page pattern:* export `metadata: { title: "Courses" }` and the template
  supplies the suffix. Client components can't export metadata, so a page that
  needs a title gets a thin server `layout.tsx` — see
  `app/(admin)/account/layout.tsx`.
- **Error boundaries.** `app/error.tsx` (branded recovery with **Try again** and
  a link home, surfacing Next's `digest` for bug reports), `app/loading.tsx`,
  and `app/global-error.tsx` for failures in the root layout itself — which
  `error.tsx` cannot catch. `global-error.tsx` is styled inline because the
  stylesheet may not have loaded when it fires.

### Group 3 — Security and auth quality

- **`can()` wired in.** `navigationFor(can)` now takes the permission predicate,
  so the sidebar asks the same authority as every route guard. A test asserts
  the invariant directly: *nothing appears in the nav that the access matrix
  would redirect.* `navigationForRole(role)` remains for callers without an auth
  context.
- **`escape`/`unescape` removed** from `session.ts` in favour of
  `TextEncoder`/`TextDecoder`, which work identically in the browser, Node and
  the edge runtime. Decoding now uses `{ fatal: true }` so corrupt UTF-8 is
  rejected instead of silently becoming U+FFFD, and non-finite `exp` values are
  rejected (`JSON.stringify` turns `Infinity`/`NaN` into `null`).
- **Content-Security-Policy** — `lib/csp.ts`, applied in middleware.
  Per-request nonce plus `strict-dynamic`: only scripts carrying the current
  nonce run, so an injected `<script>` is refused even on our own origin. This
  is the primary XSS mitigation, since the token is in `localStorage`.

  `connect-src` includes the API origin derived from `NEXT_PUBLIC_API_BASE_URL`
  (reduced to its origin — a value with a path is invalid and would block every
  request). `'unsafe-eval'` and `ws:` are dev-only. `style-src` keeps
  `'unsafe-inline'` because React writes style attributes and Next inlines
  critical CSS; neither can carry a nonce, and CSS injection cannot read
  `localStorage`.

> **Bug caught during verification.** With the CSP first applied, the header
> carried a nonce but **all 23 script tags in the delivered HTML had none** —
> the pages were statically prerendered, and build-time HTML cannot hold a
> per-request nonce. Because `strict-dynamic` makes browsers ignore `'self'`,
> **every script would have been refused and the app would have rendered
> blank.** The build log looked perfectly healthy. Fixed with
> `export const dynamic = "force-dynamic"` in the root layout; all routes now
> render per request. The cost is nil — every route is an authenticated client
> component that fetches on mount, there is no anonymous traffic, and the app is
> noindex.

### Group 4 — Testing

Vitest, chosen over Jest for speed and zero-config TS. Path aliases resolve
natively via `resolve.tsconfigPaths` (Vite 7), so no alias table is duplicated.

```
npm test              # single run
npm run test:watch    # watch mode
npm run test:coverage # with v8 coverage + thresholds
npm run typecheck     # tsc --noEmit
```

**89 tests across 4 files. Coverage of `src/lib`: 99.1% statements, 100%
branches** — gated at 90/85 in `vitest.config.ts`, so a regression fails the
run rather than being noticed later.

| Suite | Covers |
| :--- | :--- |
| `session.test.ts` | `hasRole` inheritance (incl. that admin does **not** inherit super_admin), the role-routing matrix, and every `decodeSessionHint` rejection: expired, `exp` exactly now, student role, unknown role, wrong types, non-finite `exp`, malformed base64, non-object JSON, and "never throws whatever it is handed" |
| `rbac.test.ts` | `ruleFor` longest-prefix matching (`/administrator` must not inherit `/admin`), retired/public paths, a 21-case route access matrix across all roles, and the nav ⇄ access-matrix invariant |
| `csp.test.ts` | nonce uniqueness and shape, no `unsafe-inline` in `script-src` ever, `unsafe-eval` dev-only, API origin in `connect-src`, path reduction, malformed-env fallback, hardening directives |
| `session.cookie.test.ts` | cookie round trip, 7-day expiry, `Secure` only over https, overwrite-not-stack, clearing, and SSR/edge no-op safety |

### Verified

`typecheck` clean · `eslint` clean on all changed files · `next build` passes
(29 routes) · 89/89 tests green · runtime checks against a production server:
nonce in header **matches** the nonce in HTML with **0 of 21 scripts missing**
one, nonce differs per request, all 6 security headers present, `<title>` renders
`Sign in | UniMate Dashboard`, and the full Phase 1 routing matrix still behaves.

### Known, not addressed

- **`npm audit`: 13 vulnerabilities (1 critical, 10 high)**, all from boilerplate
  dependencies (`swiper` prototype pollution and similar). Fixing needs
  `--force` and breaking upgrades. Worth a dedicated pass — several of these
  packages are only used by the retired template pages, so deleting those may
  remove the dependency need entirely.
- **Backend:** `user.service.js:215` hardcodes `adminId: "A101"` for every admin
  in `GET /auth/me`. The Account page sidesteps it by preferring
  `GET /admins/me`, but the endpoint is still wrong for any other consumer.
- 3 pre-existing lint errors remain in untouched boilerplate.

---

## Phase 1.2 — Phase 1 Close-Out ✅

The final four objectives for "Harden the Foundation".

### 1. Student logins rejected

Already enforced in `authService.loginUser`; the message is now the agreed copy.
Worth noting the mechanism: the check runs **before anything is persisted**, so no
tokens, no cached user and no session-hint cookie are ever written. There is no
session to destroy and no window in which the edge could see a student as signed
in.

> Access Denied: The web dashboard is for staff only. Please log in via the UniMate mobile app.

### 2. API error interceptors

Landed in Phase 1; the 429 copy is now the agreed wording. Current behaviour in
`services/apiClient.ts`:

- **Envelope extraction** — reads `{ success: false, error: { message } }`,
  falling back to a generic message for 5xx and to a transport message when no
  response arrived at all.
- **401** — single-flight refresh against `POST /auth/refresh` (concurrent 401s
  must not race and invalidate each other's rotated token), then one retry. If
  refresh fails, tokens and the session cookie are cleared and `AuthContext`
  redirects to `/signin`. A refresh that fails on a *network* error keeps the
  session rather than signing the user out on a blip.
- **429** — "Rate limited. Please try again shortly.", upgraded to a concrete
  wait when the server sends `Retry-After`.
- Auth endpoints are excluded from the retry loop; all requests time out at 20s.

### 3. Profile page

Moved `/account` → **`/profile`**, now that deleting the boilerplate freed the
path. One shared route for all three staff roles, rendering role-aware fields
from `GET /auth/me` plus `GET /admins/me` for admins.

Strictly read-only, with the informational banner at the top. This is a
constraint, not a preference — see **BE-6**: `/auth/reset-password` and
`/auth/set-password` reject admins outright and work exactly once for teachers,
and `PATCH /teachers/:id` is admin-only. There is no endpoint a self-service edit
form could call.

### 4. Boilerplate deleted

**49 files across 10 directories**, all recoverable from git history.

| Removed | Detail |
| :--- | :--- |
| `(ui-elements)` + `(others-pages)` | 14 template routes |
| Orphaned components | ecommerce, example, videos, charts, calendar, user-profile, tables |
| `components/form/form-elements` | 10 demo components |
| `/signup` + `SignUpForm` | no API endpoint exists behind it |

**Routes: 29 → 14. Production dependencies: 21 → 8.** Removed `@fullcalendar/*`
(6 packages), `@react-jvectormap/*` (2), `apexcharts`, `react-apexcharts`,
`react-dropzone`, and the now-obsolete jvectormap React-19 overrides. Kept
`flatpickr` and `components/form/date-picker.tsx` — Phases 3–5 need date inputs.

Config files updated: **`lib/routes.ts`** (`/profile` out of `RETIRED_PATHS`, into
`ROUTE_RULES`) and **`lib/navigation.tsx`** — the sidebar's single source of truth,
where "Account" became "Profile". `RETIRED_PATHS` still redirects the deleted URLs
so stale bookmarks land somewhere useful rather than a bare 404.

### Bonus: middleware → proxy

The Next 16.2 upgrade began warning that the `middleware` file convention is
deprecated. Renamed `src/middleware.ts` → `src/proxy.ts` with the export renamed
to `proxy`, then re-verified the full access matrix — this file *is* the access
control, so a silent break would be serious.

### Verified

`typecheck` clean · 90/90 tests · `next build` clean (14 routes, deprecation
warning gone) · runtime against a production server: deleted routes redirect,
`/profile` allows teacher + admin and rejects anonymous/student, workspace gating
holds, CSP nonce matches with 0 scripts missing one, 6/6 security headers.

### Known

- **`npm run lint` now reports 13 errors**, all `react-hooks/set-state-in-effect`,
  newly enforced by the `eslint-config-next` 16.0.7 → 16.2.12 upgrade. It is the
  same fetch-on-mount pattern in 11 files. Not bugs, but they will fail a CI lint
  gate until the data-fetching pattern is reworked — worth folding into Phase 2.
- `/account` now 404s. It existed only within this session, so no real bookmarks.
- 15 dev-only npm advisories remain (eslint toolchain). Production: **0**.
