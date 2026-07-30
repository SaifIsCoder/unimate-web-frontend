# UniMate Web Dashboard — Architecture & Delivery Plan

The UniMate Web Dashboard is a single Next.js application serving **Teachers**, **Admins** and **Super Admins** through role-based access control, backed by the UniMate Express API. The Student experience lives in the mobile app and is out of scope here.

This document is the working contract for the dashboard. Every capability below is stated against a real endpoint in `server/API_COLLECTION.json`; anything the API cannot currently do is quarantined in §6 rather than promised in the roadmap.

> **Revision note.** This replaces an earlier draft that assumed Supabase Auth, campus-wide announcement broadcasts, a teacher post-approval queue, grade locking and Expo push. None of those exist in the backend. The corrected contract is §2; the blocked items and the backend work they need are §6.

---

## 1. Backend Contract

Everything the dashboard talks to is the UniMate Express API. There is no direct database access from the browser.

| Property | Value |
| :--- | :--- |
| Base URL | `http://localhost:5000/api/v1` (`NEXT_PUBLIC_API_BASE_URL`) |
| Surface | 134 endpoints across 19 modules |
| Transport | REST/JSON |
| Success envelope | `{ "success": true, "data": <payload> }` |
| Error envelope | `{ "success": false, "error": { "message", "type", "code" } }` |
| CORS origin | single origin from `FRONTEND_URL` (default `http://localhost:3000`) |

### Authentication — custom JWT, **not** Supabase Auth

`config/supabase.js` exists in the server but is imported by zero modules. Supabase is the **Postgres host only**; the API uses `pg` directly and issues its own tokens.

- `POST /auth/login` — unified, role-agnostic. Returns `token`, `accessToken`, `refreshToken`, `expiresIn`, `role`, `user`.
- `POST /auth/refresh` — access token lives **1 day**, refresh token **7 days**.
- `GET /auth/me` — role-shaped profile.
- `POST /auth/logout` — client-side only; the server does not revoke tokens.
- Tokens are HS256, sent as `Authorization: Bearer <token>`.
- Every authenticated request re-checks that the user still exists and is `is_active`; a deactivated account starts failing immediately with 403.

### Roles

Four roles: `super_admin`, `admin`, `teacher`, `student`. **`super_admin` inherits `admin`** — any gate accepting `admin` also accepts `super_admin`. The one place they diverge: **only a `super_admin` may create `admin` or `super_admin` accounts.**

### Rate limits — a real design constraint

- Global: **100 requests / 15 min per IP**
- Login routes: **5 attempts / 15 min per IP**

The global limit rules out naive bulk operations from the browser (see §6, BE-5).

### Validation

Joi with `stripUnknown: true`, `allowUnknown: false`, `convert: true`. Unknown keys are silently dropped, not rejected; schema violations return **400** with all messages joined.

---

## 2. Current Implementation Status

The dashboard is well past boilerplate. **51 of 134 endpoints (38%) are reachable** from `src/config/api.ts`.

### Built and working

| Area | Route | Backing endpoints |
| :--- | :--- | :--- |
| Auth + session | `/signin`, `AuthContext` | `/auth/login`, `/auth/refresh`, `/auth/me` |
| Admin overview | `/admin` | module cards |
| User provisioning | `/admin/users` | `POST /users`, `GET /users` |
| Courses | `/admin/courses` | `/courses` — **5/5 complete** |
| Offerings | `/admin/offerings` | `/offerings` — **5/5 complete** |
| Enrollments | `/admin/enrollments` | `/enrollments` 6/7 |
| Announcements | `/admin/announcements` | `/announcements` 5/6 |
| Events | `/admin/events` | `/events` 5/6 |
| Teacher overview | `/teacher` | `/teachers/me/offerings`, `/schedules/me` |
| Class workspace | `/teacher/classes/[offeringId]` | Roster · Attendance · Grades · Announce tabs |

`communicationService.ts` and `userService.ts` already encode the tricky backend rules correctly (announcement `xor` targeting, `super_admin`-only role assignment). Keep that pattern: **service layer owns the API contract, pages own presentation.**

### Module coverage

| Module | Wired / Total | Gap |
| :--- | :--- | :--- |
| courses, offerings | 5/5, 5/5 | — |
| users, enrollments, events, announcements | 5/6, 6/7, 5/6, 5/6 | trivial |
| attendance | 4/8 | reporting views |
| teachers | 3/7 | faculty roster |
| grades | 3/9 | transcript, reporting |
| departments | 2/5 | **no CRUD UI** (backend supports it) |
| admins | 1/5 | admin directory |
| students | 1/8 | **no directory** |
| schedules | 1/8 | **Master Timetable 0%** |
| **assignments** | **0/11** | **not started — highest-value gap** |
| **community** | **0/10** | not started (also blocked, §6) |
| notifications | 0/4 | not started |
| ai | 0/10 | correctly excluded — student-only |

### Known debt

- ~~**Route protection is client-side only.**~~ **Resolved in Phase 1.** `middleware.ts` now gates at the edge off a credential-free session-hint cookie, with `RequireRole` as the second layer. The API remains the real authorisation boundary.
- **Boilerplate still shipping**: `(ui-elements)/*` (7 pages) and `(others-pages)/*` (7 pages incl. `blank`, `calendar`, `basic-tables`) remain in the bundle and the sidebar. Removed in Phase 1.
- **No Profile page** for either role.

---

## 3. Architecture

### Routing

```
src/app/
  (full-width-pages)/(auth)/signin        public
  (admin)/admin/*                         admin + super_admin
  (admin)/teacher/*                       teacher
```

`homePathForRole()` in `AuthContext` resolves the landing route: `teacher → /teacher`, `admin | super_admin → /admin`. A `student` token must be rejected at login with a clear message — the dashboard is not their surface.

### Layers

```
app/          pages — presentation and local state only
components/   admin/ · teacher/ · common/ · ui/
services/     one module per backend domain; owns payload shape and API rules
config/api.ts single source of endpoint URLs
context/      AuthContext (session, role, token refresh)
types/        shared response types
```

**Rule:** pages never build request payloads or hardcode URLs. Anything the backend constrains (xor targeting, `reference_id` linkage, attendance exception semantics) is encoded in `services/` with a comment citing the rule, so the constraint survives refactors.

### Shared modules

- **Authentication** — single login resolving role and landing route.
- **Profile** — own account details; password change (note the constraint in §6, BE-6).
- **Student lookup** — admins get the full directory; teachers get their own rosters only (§5).

### Teacher workspace

Scoped strictly to owned offerings — the API enforces this via `assertAccessToOffering`, so the UI need only avoid offering what would 403.

- **My Classes** — assigned offerings and weekly timetable.
- **Class workspace** (per offering) — Roster · Attendance · Grades · Assignments · Announce.

### Admin console

- **Institutional setup** — departments, courses, offerings with assessment weights.
- **Master Timetable** — schedule slots plus cancellations, reschedules and extra classes.
- **People** — user provisioning, student directory, faculty roster.
- **Communications** — department/semester/offering announcements, campus events.
- **Reports** — transcripts, attendance eligibility.

---

## 4. Navigation

Rendered dynamically from role. Items marked ⛔ require backend work first (§6).

**Dashboard** — Overview *(role-contextual)*

**Academic**
- Departments *(Admin)*
- Courses *(Admin)* · Offerings *(Admin)*
- Master Timetable *(Admin)*
- My Classes *(Teacher)*
- Class workspace → Roster · Attendance · Grades · Assignments *(Teacher)*

**People**
- User Provisioning *(Admin)*
- Student Directory *(Admin)*
- Faculty Roster *(Admin)*
- Admin Directory *(Super Admin)*

**Communications**
- Announcements *(Shared — scoped by role)*
- Event Manager *(Admin)*
- Notification Inbox *(Shared)*
- Moderation Queue ⛔ *(needs BE-1)*

**Reports**
- Transcript Export *(Admin)*
- Attendance Eligibility *(Admin / Teacher)*
- System Analytics ⛔ *(needs BE-4)*

**Settings** — Profile *(Shared)*

---

## 5. RBAC Matrix

Every cell reflects what the API actually enforces.

| Capability | Teacher | Admin | Super Admin | Endpoints |
| :--- | :--- | :--- | :--- | :--- |
| Departments | View | Full CRUD | Full CRUD | `GET` open to all authenticated; writes admin+ |
| Courses | View | Full CRUD | Full CRUD | `GET /courses` open; writes admin+ |
| Offerings + weights | View | Full CRUD | Full CRUD | writes admin+ |
| Enrollments | Roster of **owned** offerings | Full CRUD | Full CRUD | `GET /enrollments/offering/:id` admin+teacher; rest admin |
| Schedules | Own timetable; create/delete on owned offerings | Full | Full | `GET /schedules/me` teacher; `GET /schedules` is **student-only** |
| Attendance | Record + read on owned offerings | Read all | Read all | `POST /attendance` admin+teacher |
| Grades | Submit + read on owned offerings | Read all | Read all | `POST /grades` admin+teacher |
| Transcripts | **Denied (403)** | View | View | `GET /grades/student/:id/transcript` |
| Assignments | Full CRUD on owned offerings | Full CRUD | Full CRUD | `/assignments` admin+teacher |
| Announcements | Create for **owned offerings only** | Create for **own department**, delete any | Same | `.xor(offering_ids, department_id, semester)` |
| Events | View (public) | Full CRUD | Full CRUD | reads public; writes admin |
| Users | — | Create student/teacher | Create **any** role | only super_admin creates admin+ |
| Students / Teachers directory | — | Full | Full | `GET /students`, `GET /teachers` admin-only |
| Community posts | View own dept | Moderate own dept | Moderate own dept | **teachers cannot moderate** |

Two asymmetries that will surprise people:

1. **Teachers cannot read transcripts.** `getStudentTranscript` rejects any non-admin, non-self caller.
2. **`GET /schedules` is student-only.** Teachers must use `/schedules/me`.

---

## 6. Capability Boundaries — What the API Cannot Do Yet

Do not schedule dashboard work for these until the paired backend change ships. Each is a discrete, independently deliverable server task.

### BE-1 · Community approval workflow — blocks Moderation Queue

`community_posts.status` defaults to `'active'` and permits only `active | hidden | deleted`. Posts are live on creation — there is nothing pending to approve. Separately, `updatePost`/`deletePost` gate moderation behind `isAdmin(role)`, so **teachers cannot moderate at all**.

*Needs:* a `pending` status + default, a teacher-scoped moderation permission for their own department, and a `GET /community/posts?status=pending` filter.

*Decision required:* is moderation pre-publication (posts start `pending`) or post-publication (reactive takedown)? Reactive is far cheaper and needs only the teacher-permission half.

### BE-2 · Global announcements — blocks campus-wide broadcast

`.xor("offering_ids", "department_id", "semester")` forces exactly one target, and an admin may only target **their own** `department_id` (403 otherwise). There is no institution-wide scope.

*Needs:* a `global: true` target (or a super-admin bypass of the department check) plus recipient resolution across all users.

### BE-3 · Grade locking — blocks end-of-semester freeze

No lock endpoint, no lock column. `POST /grades` upserts indefinitely.

*Needs:* a lock flag on `course_offerings` (or a semester-level lock) and a guard in `submitGrade`.

### BE-4 · Analytics aggregates — blocks System Analytics

No aggregate endpoints exist. Computing university-wide averages client-side means fanning out per-offering requests, which the 100-req/15-min limiter forbids.

*Needs:* purpose-built summary endpoints.

### BE-5 · Bulk import — blocks CSV onboarding

No bulk endpoint. Looping `POST /users` for a 200-student batch exceeds the global rate limit and fails partway with no transaction boundary.

*Needs:* `POST /users/bulk` accepting an array in one transaction, plus a limiter exemption.

### BE-6 · Self-service credential management — degrades Profile

`/auth/reset-password` and `/auth/set-password` are **student/teacher only** (admins get 403) and work **exactly once** — `password_changed` locks them out afterwards, with "Contact an admin to reset it." There is no teacher self-update for profile fields (`PATCH /teachers/:id` is admin-only).

*Needs:* an authenticated change-password endpoint that verifies the current password and is repeatable, plus self-service profile fields.

### BE-7 · Notification composer — blocks manual sends

Push is **Firebase FCM**, not Expo, and fires only as a side effect of announcement create/update. No standalone trigger.

*Needs:* a compose-and-send endpoint if manual notifications are wanted. Otherwise drop the feature and rely on announcements.

### Not a gap, but constrains the UI

- **Rooms are free text.** `schedules.room` is a string; there is no rooms entity. Overlap detection catches only same-offering/same-day collisions — **not** teacher double-booking or room clashes. Cross-offering conflict checks must be client-side, or become a backend request.
- **Attendance is exception-based.** `POST /attendance` marks every enrolled student `present` by default; you send only the absences/lates/leaves. Body requires exactly one of `offering_id` or `session_id`, and `offering_id` additionally requires `date`. The UI must default to present and submit diffs.
- **Grades split into two shapes.** For `assignment | quiz | presentation | project` a `reference_id` pointing at an assignment in the same offering is **required**, and `title`/`max_score` are overwritten from it. For `sessional | midterm | final | practical` you supply `title` and `max_score` directly. **This makes Assignments a hard prerequisite for full gradebook coverage.**

---

## 7. Phased Delivery Plan

Sequential. Each phase is shippable on its own and lists what unblocks it. Backend tasks (BE-*) run in parallel and must land before the phase that consumes them.

### Phase 0 — Done
Auth + session, RBAC route groups, user provisioning, courses, offerings, enrollments, announcements, events, teacher class workspace (Roster/Attendance/Grades/Announce).

---

### Phase 1 — Harden the Foundation
*No new backend needed. Removes debt before it compounds.*

- Add `middleware.ts` for server-side route gating; kill the unauthenticated flash.
- Reject `student` logins at the dashboard with an explanatory message.
- Delete `(ui-elements)/*` and unused `(others-pages)/*`; prune the sidebar.
- Build **Profile** for both roles from `GET /auth/me` — read-only where BE-6 blocks editing, with an honest "contact an admin" note.
- Centralise error handling: surface `error.message` from the envelope; handle 401 → refresh → retry → sign-out, and 429 with a "rate limited, retry shortly" message.

**Exit:** no boilerplate routes ship; deep links never flash protected content; every failure path shows a real message.

---

### Phase 2 — Complete Admin Foundations
*Endpoints already exist and are unused.* **Depends on:** Phase 1.

- **Departments CRUD** — `POST/PATCH/DELETE /departments`. Note the id is an **integer**, not a UUID.
- **Student Directory** — `GET /students`, `GET /students/:id`, `GET /students/:id/enrollments`, `GET /students/semester/:semester`.
- **Faculty Roster** — `GET /teachers`, `GET /teachers/:id`, `GET /teachers/:id/offerings`, `PATCH`, `DELETE`.
- **Admin Directory** *(super_admin)* — `GET /admins`, `GET /admins/:id`, `PATCH`, `DELETE`.
- Surface `assignableRoles()` in the UI so admins never see a role they'd be 403'd on.

**Exit:** every people-management and institutional-setup endpoint is reachable; departments no longer a read-only picker.

---

### Phase 3 — Master Timetable
**Depends on:** Phase 2 (offerings + teachers must be manageable). *7 of 8 schedule endpoints currently unused.*

- Weekly grid per offering — `GET /schedules/offering/:offeringId`.
- Create/delete slots — `POST /schedules`, `DELETE /schedules/:id`. Surface the server's 409 on same-day overlap as an inline conflict warning.
- **Exceptions** — `POST /schedules/exceptions`, `GET /schedules/offering/:offeringId/exceptions`, `DELETE /schedules/exceptions/:id`. Covers cancellations, reschedules and extra classes; feeds the mobile student timetable directly.
- Client-side cross-offering conflict detection for teacher double-booking and room clashes, clearly labelled advisory (the server does not enforce it).

**Exit:** an admin can build a full weekly timetable and publish a cancellation that the mobile app reflects.

---

### Phase 4 — Assignments & Tasks
**Depends on:** Phase 2. **Highest-value remaining gap — 0 of 11 endpoints wired, and a hard prerequisite for Phase 5.**

- Teacher CRUD — `POST /assignments`, `GET /assignments`, `PATCH /assignments/:id`, `DELETE /assignments/:id`.
- Per-offering list — `GET /assignments/offering/:offeringId` in the class workspace.
- Detail + completion — `GET /assignments/:id`, `PATCH /assignments/:id/done`.
- Handle the two server rejections inline: **due date in the past → 400**, **duplicate title+description in the same offering → 409**.
- Publishing an assignment auto-notifies enrolled students via FCM. Say so in the UI.

**Exit:** a teacher can run the full assignment lifecycle, and each assignment exposes the `id` that Phase 5 needs as `reference_id`.

---

### Phase 5 — Complete the Gradebook
**Depends on:** Phase 4 — assignment-type grades cannot be submitted without an assignment to reference.

- Assignment-linked grading: pick the assignment, send `reference_id`; `title`/`max_score` come from the server.
- Direct entry for `sessional | midterm | final | practical` with explicit `title` + `max_score`.
- Weighted preview — `GET /grades/student/:studentId/offering/:offeringId/calculation` (raw marks, final marks, letter, grade point, per-component breakdown).
- Offering weight editor (mid/sessional/final/practical) in the admin offerings screen, with a warning that changing weights retroactively alters computed grades.
- **Transcript Export** — `GET /grades/student/:studentId/transcript`, admin-only, rendered to PDF client-side.
- **Attendance reporting** — `GET /attendance/offering/:offeringId` with the server's `eligible_for_exam` flag at the 75% threshold; `GET /attendance/session/:sessionId` for per-session review.

**Exit:** every assessment type is gradeable, grades are explainable via the calculation breakdown, and admins can export a transcript.

---

### Phase 6 — Communications & Community
**Depends on:** **BE-1 must ship first** for the moderation queue. The notification inbox is unblocked and can go earlier.

- **Notification Inbox** — `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`.
- **Announcement management** — read tracking via `PATCH /announcements/:id/read`, editing via `PATCH /announcements/:id` (author-only; the server 403s anyone else).
- **Moderation Queue** ⛔ — once BE-1 lands: `GET /community/posts`, `PATCH /community/posts/:id`, comment moderation, `DELETE`.

**Exit:** dashboard users have an in-app inbox; moderators can action their department's feed.

---

### Phase 7 — Analytics & Polish
**Depends on:** **BE-4** for real aggregates. Do not attempt client-side fan-out — the rate limiter will break it.

- Admin analytics: attendance averages, grade distributions, enrolment load.
- Bulk CSV onboarding *(needs BE-5)*.
- Accessibility pass, empty/loading/error states, responsive audit.

---

### Sequencing summary

```
Phase 1 ─→ Phase 2 ─┬─→ Phase 3  (Timetable)
                    └─→ Phase 4 ─→ Phase 5  (Assignments → Gradebook)

Phase 6  needs BE-1 (moderation only)
Phase 7  needs BE-4, BE-5

Backend track, schedule ahead of need:
  BE-1 before Phase 6 moderation
  BE-4, BE-5 before Phase 7
  BE-2, BE-3, BE-6, BE-7 — product decisions, unscheduled
```

---

## 8. Post-MVP

- **Drag-and-drop timetable** with live conflict detection — worthwhile only after rooms become a real entity.
- **File storage** for assignment attachments. `POST /assignments/:id/submit` already accepts a `fileUrl`, but nothing hosts the file; needs a storage bucket and upload endpoint.
- **Parent portal** — read-only attendance and grades.
- **AI insights for staff.** All 10 `/ai/*` endpoints are `student`-only today; staff-facing analysis would need new, separately-scoped endpoints.
