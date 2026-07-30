# UniMate Dashboard — Delivery Progress

Running record of the phased build described in `dashboard_architecture_plan.md`.
Updated at the end of every phase. Each entry states what shipped, how it was
verified, and what was deliberately left out.

**Backend surface reachable from the dashboard: 85 / 134 endpoints (63%).**
Phases 1 and 1.x were foundation work; Phase 2 added 15, Phase 3 added 6, Phase 4 added 7, Phase 5 added 6.

**Lint: 0 errors, 0 warnings** as of Phase 4.

| Phase | Scope | Status |
| :--- | :--- | :--- |
| 0 | Auth, RBAC route groups, admin CRUD, teacher class workspace | ✅ Complete (pre-existing) |
| **1** | **Harden the foundation** | **✅ Complete — 2026-07-29** |
| **1.1** | **Cleanup pass — boilerplate, CSP, error boundaries, tests** | **✅ Complete — 2026-07-29** |
| **1.2** | **Phase 1 close-out — boilerplate deleted, /profile, deps pruned** | **✅ Complete — 2026-07-29** |
| **2** | **Complete admin foundations (Departments, Student Directory, Faculty Roster, Admin Directory)** | **✅ Complete — 2026-07-30** |
| **3** | **Master Timetable (schedules + exceptions)** | **✅ Complete — 2026-07-30** |
| **4** | **Assignments & Tasks** | **✅ Complete — 2026-07-30** |
| **5** | **Complete the gradebook (transcripts, weights, attendance reporting)** | **✅ Complete — 2026-07-30** |
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

---

## Phase 2 — Complete Admin Foundations ✅

Every people-management and institutional-setup endpoint is now reachable.
**Backend coverage: 51 → 66 of 134 endpoints (38% → 49%).**

### Shipped

| Screen | Route | Endpoints wired |
| :--- | :--- | :--- |
| Departments CRUD | `/admin/departments` | `GET/POST/PATCH/DELETE /departments` |
| Student Directory | `/admin/students` | `GET /students`, `GET /students/semester/:semester` |
| Student detail | `/admin/students/[studentId]` | `GET /students/:id`, `GET /students/:id/enrollments` |
| Faculty Roster | `/admin/faculty` | `GET /teachers`, `PATCH`, `DELETE` |
| Faculty detail | `/admin/faculty/[teacherId]` | `GET /teachers/:id`, `GET /teachers/:id/offerings` |
| Administrators | `/admin/administrators` | `GET /admins`, `GET /admins/:id`, `PATCH`, `DELETE` |

New: `services/directoryService.ts`, `components/admin/ConfirmDialog.tsx`,
`components/admin/DetailField.tsx`, and 9 Phase-2 types in `types/academics.ts`.

### Department ids are integers

Unlike every other resource, departments use a serial integer PK. `DEPARTMENTS.BY_ID`
takes `number`, the editing state is `number | null`, and `rowKey` stringifies
explicitly rather than letting a number leak into a uuid-shaped slot.

### Super-admin gating — three layers

`/admin/administrators` is guarded independently at each level, because any one
of them can be bypassed:

1. **Edge** — a `/admin/administrators` rule in `lib/routes.ts` that wins over
   `/admin` by longest-prefix match.
2. **Navigation** — the link is filtered out by `can()` for plain admins.
3. **Client tree** — a `RequireRole roles={["super_admin"]}` layout.

`super_admin` is named explicitly everywhere. `hasRole` expands
super_admin → admin but never the reverse, so an `["admin"]` rule would have
quietly admitted plain admins.

Verified at runtime against a production server: admin → **307 to `/admin`**,
super_admin → **200**.

A super admin also cannot delete their own admin profile — the button is
disabled, since removing it would lock them out of this screen.

### Role assignment guard

Already satisfied: `assignableRoles()` was wired into the User Provisioning role
picker in an earlier phase and filters to `student`/`teacher` for a plain admin,
adding `admin`/`super_admin` only for a super admin. Confirmed rather than
rebuilt.

### Effect pattern fixed while building

The `eslint-config-next` 16.2 upgrade newly enforces
`react-hooks/set-state-in-effect`, and the existing fetch-on-mount pattern trips
it. Rather than add six more violations, all new pages (plus `/profile`) use an
async closure inside the effect with an `alive` flag:

```ts
useEffect(() => {
  let alive = true;
  void (async () => {
    try {
      const rows = await fetchThing();
      if (alive) setRows(rows);
    } finally {
      if (alive) setLoading(false);
    }
  })();
  return () => { alive = false; };
}, []);
```

This satisfies the rule and fixes a real bug the old pattern had: a slow response
writing state after the user navigated away. Re-fetch helpers keep the plain
`setLoading(true)` call because they run from event handlers, where it is fine.

### Verified

`typecheck` clean · **107 tests** (17 new, covering the super-admin matrix and the
nav ⇄ access-matrix invariant) · build clean, 19 routes · lint clean on all Phase
2 files · runtime role matrix confirmed for anon / admin / super_admin / teacher
across all six routes including dynamic detail pages.

### Known limitations

- **BE-8 — department reassignment has no working endpoint.** `updateTeacherBody`
  and `updateAdminSchema` accept a free-text `department` string, but neither
  table has that column — only `department_id` (integer FK). `buildUpdate` maps
  payload keys straight to column names, so sending it produces
  `UPDATE teachers SET department = $1` and a **SQL error, not a 400**. Both edit
  forms therefore expose only `employee_id` / `admin_id`, and say so inline. This
  matters operationally: admins may only post announcements to their own
  department, and there is currently no way to change it.
- **Students are read-only.** `PATCH /students/:id` exists but its only useful
  field is `roll_number` — `department` hits the same BE-8 bug and `batch` is
  set at provisioning. Not worth a form yet.
- `GET /teachers/:id` returns no `department_name` (it joins only the user row),
  so the detail page resolves the name client-side from the departments list.
- **12 pre-existing lint errors remain** in 10 untouched files, all the same
  `set-state-in-effect` rule. The fix pattern above is proven and mechanical —
  worth a dedicated pass to get `npm run lint` green for CI.

---

## Phase 3 — Master Timetable ✅

Recurring weekly slots plus one-off exceptions, per offering.
**Backend coverage: 66 → 72 of 134 endpoints (49% → 54%).** Schedules go 1/8 → 7/8.

### Shipped

| Piece | File |
| :--- | :--- |
| Service, all 6 endpoints | `services/scheduleService.ts` |
| Conflict + merge logic (pure) | `lib/timetable.ts` |
| Weekly grid | `components/admin/timetable/WeeklyGrid.tsx` |
| Slot form | `components/admin/timetable/SlotForm.tsx` |
| Exception form | `components/admin/timetable/ExceptionForm.tsx` |
| Page | `/admin/timetable` |

### Two backend traps handled in the service layer

**1. The server's overlap check is string comparison.** It runs
`sch.start_time < payload.end_time` on raw strings while its Joi pattern accepts
a single-digit hour. So `"10:00:00" < "9:30"` is `true` — lexicographically
correct, chronologically wrong — and a genuine overlap passes the 409 guard.
`normaliseTime` pads everything to `HH:mm:ss` before sending, and there is a test
asserting the exact failing comparison.

**2. `date` is a Postgres `date` served as a UTC timestamp.** node-postgres
hydrates it into a JS Date, which serialises to `2026-08-03T00:00:00.000Z`.
Parsing that and reading local parts shifts the day for anyone west of UTC.
`toDateKey` slices the ISO string instead, and `dayOfWeekFor` computes in UTC.

### Conflict detection — two tiers

**Server-authoritative (hard block).** Same-offering, same-day overlap returns
409. The same condition is evaluated client-side first so the user sees it
before submitting, and the real 409 is surfaced inline in the form if the two
ever disagree.

**Advisory (dismissible).** Teacher double-booking and room clashes across *other*
offerings. The API checks neither — its guard is scoped to one offering, and rooms
are an unconstrained free-text column with no entity behind them. So these warn
and require one extra click ("Add anyway"), never a block: co-taught sessions and
two rooms with the same name are both legitimate.

Rooms are matched case- and whitespace-insensitively, and two *blank* rooms or two
*unassigned* teachers are never treated as a match — that would flag every
unassigned offering against every other.

### The rate limit shaped the design

There is no bulk schedules endpoint, so cross-offering checking needs one request
per offering against a **100-requests-per-15-minutes** budget. The index is
therefore built only when an admin first opens the add-slot form — never on page
load — then cached for the session, fetched at a concurrency of 4, and invalidated
when a slot changes. Per-offering failures are swallowed: a partial index still
catches most clashes, and an advisory feature must never block scheduling. If it
comes back empty the form says so.

### Merge logic

`buildWeekView` folds slots and exceptions into one view: exceptions attach to
their parent slot, extras get their own section, and a slot with any cancellation
is struck through (it still recurs — this means "has cancelled dates", not
"deleted").

Exceptions whose `schedule_id` matches no slot are collected as **orphaned** and
shown in a warning panel rather than dropped, which would hide real rows from the
user with no way to clean them up.

The exception form also catches two things the API allows but which are almost
always mistakes: cancelling a Monday slot on a Tuesday date (stores a row that
never matches), and adding a second exception to a slot on a date that already
has one (two contradictory records).

### Verified

`typecheck` clean · **150 tests** (44 new, all of `lib/timetable.ts`) · lint clean
on every Phase 3 file · build clean, 20 routes · runtime gating on
`/admin/timetable`: anon 307, teacher 307, admin 200, super_admin 200.

### Known limitations

- **No update endpoint** for slots or exceptions — editing means delete then
  recreate. The UI reflects that rather than faking an edit affordance.
- **Rooms remain free text.** Advisory matching is string equality, so "Lab 3"
  and "Lab-3" read as different rooms. A rooms entity would fix it properly.
- The grid shows the recurring week, not a specific calendar week. Exceptions are
  listed by date under their slot; a date-ranged view is a Phase 7 polish item.

---

## Phase 4 — Assignments & Tasks ✅

The gradebook's hard prerequisite. **Backend coverage: 72 → 79 of 134 endpoints
(54% → 59%).** Assignments go 0/11 → 7/11 (the remaining 4 are student-only).

### 0. Lint is now 100% clean

`npm run lint` → **0 errors, 0 warnings**, down from 12 errors in 10 files.

Most took the established async-closure + `alive` pattern. Three needed
something different, because the rule was pointing at a real design problem
rather than a style nit:

- **`ThemeContext`** read `localStorage` in a mount effect and mirrored it into
  state. The obvious fix — a lazy `useState` initialiser — would have been
  *wrong*: the server has no `localStorage`, so it would render "light" while
  the client rendered the saved theme, producing a hydration mismatch. Rewritten
  with **`useSyncExternalStore`**, whose `getServerSnapshot` exists for exactly
  this. Also removed the `isInitialized` flag and now syncs across tabs via the
  `storage` event.
- **`AttendancePanel`** seeded every roster row into `marks` from an effect. That
  was redundant as well as a cascading render: every read already does
  `marks[id] ?? "present"`, so the map only ever needed the teacher's
  *overrides*. Deleted the effect outright.
- **`AttendancePanel` prefill** and the timetable page both derive their loading
  flag from "which id has settled" rather than setting it at the top of an
  effect.

`coverage/**` is now eslint-ignored — it is generated reporter output, not our
code.

### 1. `services/assignmentService.ts` — 7 endpoints

The response shapes are **not uniform**, so they are typed separately rather
than papered over:

| Endpoint | Returns |
| :--- | :--- |
| `GET /assignments/offering/:id` | raw row (`Assignment`) |
| `GET /assignments` | raw row + course join + pagination (`AssignmentListRow`) |
| `GET /assignments/:id` | **reshaped** for mobile (`AssignmentDetail`) |

That last one is the trap: it returns `instructions` not `description`, `due`
not `due_date`, `maxMarks` not `total_points`, and drops `offering_id`,
`is_done` and `assessment_type` entirely. The list row therefore stays the
source of truth for the workspace.

### 2. The assignment `id` is the Phase 5 join key

`POST /grades` requires `reference_id` for every assignment-backed assessment
type and 404s without a real assignment behind it; the server then overwrites
the grade's `title` and `max_score` from that assignment. So the id is surfaced
directly in the list as a **click-to-copy chip**, documented on the `Assignment`
type, and called out in the service module header.

### 3. UI — the Assignments tab

Placed **before** Grades in the tab order, mirroring the workflow: a grade for an
assignment type cannot exist until its assignment does.

List with type/done/overdue badges, create and edit forms, mark-done and delete.

**FCM notice.** Creating an assignment pushes a notification to every enrolled
student as a side effect — there is no draft state and no way to suppress it.
The create form says so prominently before the publish button.

### 4. Inline error handling

| Rejection | Handling |
| :--- | :--- |
| **400** past due date | Blocked client-side before submit; the server's message still renders inline if the two disagree |
| **409** duplicate title + description | Previewed locally against the loaded list, which also disables the submit button |

The duplicate check mirrors the server exactly: it matches on title **and**
description *together*, and the SQL uses `COALESCE(description,'')`, so null and
empty string collide — replicated with `?? ""`.

One subtlety worth keeping: when editing, the past-date rule is skipped if the
teacher did not touch the due date, and the payload omits the field. Otherwise
editing an already-overdue assignment would be permanently blocked on a value
they never changed.

Two API behaviours surfaced honestly in confirmations:
- **Mark done is one-way.** The handler hardcodes `is_done: true` and the update
  schema does not accept the field, so nothing can reopen an assignment.
- **Delete may be refused** once grades reference the assignment — the dialog
  suggests marking it done instead.

### Verified

`npm run lint` **0/0** · typecheck clean · **176 tests** (26 new) · build clean,
20 routes · runtime gating on the class workspace unchanged (anon 307,
teacher 200, admin 307).

### Known limitations

- `difficulty` and `priority` have DB defaults but appear in neither the create
  nor update schema, so they are read-only from this client and not shown as
  editable fields.
- No draft state — creation always notifies.
- `GET /assignments/:id` is unused by the workspace, since the list row carries
  strictly more of what the teacher needs. It is wired and typed for when a
  dedicated detail route wants it.

---

## Phase 5 — Complete the Gradebook ✅

**Backend coverage: 79 → 85 of 134 endpoints (59% → 63%).** Grades 3/9 → 6/9,
attendance 4/8 → 6/8.

### Shipped

| Piece | File |
| :--- | :--- |
| Grade service, bifurcated payload | `services/gradeService.ts` |
| Attendance service, extracted | `services/attendanceService.ts` |
| Gradebook rules (pure, tested) | `lib/gradebook.ts` |
| Weighted breakdown | `components/teacher/GradeCalculationCard.tsx` |
| Weights editor | `components/admin/WeightsEditor.tsx` |
| Printable transcript | `components/admin/TranscriptView.tsx` |
| Attendance report | `/admin/attendance` |
| Transcript export | `/admin/transcripts` |

### The payload split

`POST /grades` takes two mutually exclusive shapes, and sending the wrong one is
a 400 or 404 rather than a warning:

| Types | Requires | Must omit |
| :--- | :--- | :--- |
| assignment · quiz · presentation · project | `reference_id` | `title`, `max_score` |
| sessional · midterm · final · practical | `title`, `max_score` | `reference_id` |

`submitGrade` **rebuilds the body field by field** rather than spreading, so a
stray `max_score` cannot ride along on a reference-backed grade from leftover
form state. The types are a discriminated union with an `isReferenceBackedPayload`
guard, so the compiler enforces the split at every call site.

The form bifurcates with it: reference-backed types show an assignment picker,
direct types show title and max-score fields. Showing both would imply the
server accepts both.

Two details worth keeping:
- The picker only offers assignments of the **same assessment type**. The server
  joins grades to assignments on `assessment_type` as well as id, so grading a
  quiz against a "project" assignment would create a row the student view never
  joins to.
- Score validation uses the **assignment's** `total_points` as the ceiling for
  reference-backed grades, because the server overwrites `max_score` from it —
  validating against anything else would pass scores the server then rejects.

Previously `GradesPanel` blocked these four types entirely ("grade those from
the assignments module"), which was correct before Phase 4 and is now wired.

### Weighted preview

`GradeCalculationCard` renders `/calculation` per student: raw marks, final
marks, letter, grade point and the per-component breakdown with each
component's weight and contribution.

**Nothing is recomputed client-side.** The server owns the weighting, the
`Math.ceil` rounding and the UOS scale; a second implementation would eventually
disagree with the transcript, which is the document that counts. Raw and final
marks are both shown because the rounding is *up* — 81.4 becomes 82, which can
cross a grade boundary, and that jump should not be a mystery.

### Weights editor — and a gap the API leaves open

**The API validates each weight 0–100 individually and never checks they sum to
100.** A set totalling 90 silently caps every student at 90 marks; 110 lets them
exceed 100. Neither is reported by the server, so `validateWeights` blocks both
client-side and a running total is shown live. Existing bad sets are flagged with
a red badge in the offerings table, since they may already be in the database.

The warning is the loudest element on the screen, and it is accurate rather than
generic: weights are **not** snapshotted onto grades — every mark, letter, grade
point and CGPA is recomputed from them on read, so a change rewrites history for
the whole class with no audit trail. Saving requires a second confirming press.

Two non-blocking warnings: a practical weight on a course with no practical
component (its share is always lost), and a practical course whose practical
weight is zero (those marks never count).

### Transcript export — print, not a PDF library

`window.print()` against a print stylesheet, rather than jsPDF or html2canvas.

For a table of text this is both cleanest and highest-fidelity: it produces real
selectable text at the user's paper size, whereas html2canvas rasterises the page
into a blurry image and jsPDF would mean maintaining this layout twice in two
different APIs. The browser's "Save as PDF" destination covers the requirement
with **no dependency at all**.

The stylesheet uses `visibility` rather than `display` to hide the chrome, which
keeps ancestors in the layout tree so the transcript retains its containing
block. Grade badges lose their colour in print, so the letter is also emitted as
plain text for the printed copy.

Transcripts are **admin-only** — the API 403s teachers explicitly — so this lives
under `/admin` and is never linked from the teacher workspace.

### Attendance reporting

`/admin/attendance` leads with eligibility, because that is the reason the screen
exists: a banner naming every student who cannot sit the final exam, then the
per-student table, then per-session drill-down.

`eligible_for_exam` is taken verbatim from the server and **never recomputed**.
The server excludes approved leaves from the denominator
(`adjusted_total = total_lectures − leaves`), and a client reimplementation would
drift from the rule that actually decides who sits the exam. The UI says the
percentage is out of *adjusted* lectures so the number is not misread.

### Verified

lint **0/0** · typecheck clean · **204 tests** (28 new, covering the payload
split, weight validation including floating-point drift, and grade helpers) ·
build clean, 22 routes · runtime gating: `/admin/attendance` and
`/admin/transcripts` both anon 307, teacher 307, admin 200, super_admin 200.

### Known limitations

- **No grade lock** (BE-3). Nothing freezes marks at semester end, and weights
  stay editable forever.
- Transcripts include only *actively enrolled* offerings, so a dropped course
  vanishes from the CGPA rather than counting as a fail. That is the server's
  rule, surfaced in the footnote.
- Grades are written one request per student — there is no bulk endpoint — so a
  large class is a slow sequential run. Deliberate: parallel writes would trip
  the 100-per-15-minutes limiter.
- The transcript is computed live, not sealed. Re-exporting after a grade or
  weight change produces a different document; the footnote says so.
