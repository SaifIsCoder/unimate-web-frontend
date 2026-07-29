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
added     src/middleware.ts
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
