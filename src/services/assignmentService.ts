import API_ENDPOINTS from "@/config/api";
import type {
  Assignment,
  AssignmentDetail,
  AssignmentListRow,
  AssignmentType,
  Paginated,
} from "@/types/academics";
import { buildQuery, httpDelete, httpGet, httpPatch, httpPost } from "./http";

/**
 * Assignments — the teacher-facing task lifecycle.
 *
 * **This module is a hard prerequisite for the gradebook.** `POST /grades`
 * requires a `reference_id` for every assignment-backed assessment type
 * (assignment, quiz, presentation, project) and 404s without a real assignment
 * behind it. The server then overwrites the grade's `title` and `max_score`
 * from that assignment, so the id returned here is the join key for Phase 5 —
 * never discard it.
 *
 * Response shapes are NOT uniform: the list endpoints return the raw row, while
 * `GET /assignments/:id` returns a reshaped object for the mobile client. Both
 * are typed separately rather than papered over.
 */

// ── Reads ────────────────────────────────────────────────────────────────────

/** Assignments for one offering, ordered by due date ascending. */
export const listAssignmentsByOffering = (offeringId: string) =>
  httpGet<Assignment[]>(API_ENDPOINTS.ASSIGNMENTS.BY_OFFERING(offeringId));

export type AssignmentQuery = {
  offering_id?: string;
  is_done?: boolean;
  page?: number;
  limit?: number;
};

/**
 * Paginated across offerings. A teacher is transparently scoped to their own
 * offerings server-side, and gets 403 if they pass an `offering_id` they do not
 * own.
 */
export const listAssignments = (query: AssignmentQuery = {}) =>
  httpGet<Paginated<AssignmentListRow>>(
    `${API_ENDPOINTS.ASSIGNMENTS.ROOT}${buildQuery({
      offering_id: query.offering_id,
      is_done: query.is_done === undefined ? undefined : String(query.is_done),
      page: query.page,
      limit: query.limit,
    })}`,
  );

/**
 * Detail view. Returns the *reshaped* payload described on `AssignmentDetail` —
 * for anything needing `offering_id` or `is_done`, use the list row.
 */
export const getAssignment = (id: string) =>
  httpGet<AssignmentDetail>(API_ENDPOINTS.ASSIGNMENTS.BY_ID(id));

// ── Writes ───────────────────────────────────────────────────────────────────

export type CreateAssignmentPayload = {
  offering_id: string;
  title: string;
  description?: string | null;
  assessment_type: AssignmentType;
  /** ISO 8601. Must be in the future — the server rejects the past with 400. */
  due_date: string;
  total_points: number;
};

/**
 * Publishing an assignment **notifies every enrolled student** via Firebase
 * Cloud Messaging, as a side effect of creation. There is no draft state and no
 * way to suppress it, so the UI warns before submitting.
 *
 * Two rejections worth handling inline:
 *   - **400** — `due_date` is in the past.
 *   - **409** — another assignment on this offering already has the same title
 *     *and* description. Matching is on the pair, so changing either clears it.
 */
export const createAssignment = (payload: CreateAssignmentPayload) =>
  httpPost<Assignment>(API_ENDPOINTS.ASSIGNMENTS.ROOT, {
    offering_id: payload.offering_id,
    title: payload.title.trim(),
    // The schema allows null/"" — send null rather than "" so "no description"
    // is one value in the database, which also keeps duplicate matching sane.
    description: payload.description?.trim() || null,
    assessment_type: payload.assessment_type,
    due_date: payload.due_date,
    total_points: payload.total_points,
  });

export type UpdateAssignmentPayload = Partial<
  Pick<
    CreateAssignmentPayload,
    "title" | "description" | "assessment_type" | "due_date" | "total_points"
  >
>;

/**
 * Every field is optional. Note the update schema has no `.min(1)`, so an empty
 * patch is accepted and simply changes nothing — the UI avoids sending one.
 *
 * The duplicate check runs here too: 409 if the resulting title + description
 * collides with a *different* assignment on the same offering.
 */
export const updateAssignment = (id: string, payload: UpdateAssignmentPayload) => {
  const body: Record<string, unknown> = {};

  if (payload.title !== undefined) body.title = payload.title.trim();
  if (payload.description !== undefined) {
    body.description = payload.description?.trim() || null;
  }
  if (payload.assessment_type !== undefined) body.assessment_type = payload.assessment_type;
  if (payload.due_date !== undefined) body.due_date = payload.due_date;
  if (payload.total_points !== undefined) body.total_points = payload.total_points;

  return httpPatch<Assignment>(API_ENDPOINTS.ASSIGNMENTS.BY_ID(id), body);
};

/**
 * Marks an assignment complete.
 *
 * **One-way.** The handler hardcodes `is_done: true`, and the update schema
 * does not accept `is_done`, so there is no way to reopen an assignment through
 * the API. The UI says so before confirming.
 */
export const markAssignmentDone = (id: string) =>
  httpPatch<Assignment>(API_ENDPOINTS.ASSIGNMENTS.DONE(id), {});

/**
 * Hard delete.
 *
 * Grades reference assignments via `grades.reference_id`, so removing one that
 * has already been graded may be refused by the database, or orphan those
 * grades. Prefer marking it done once marks exist.
 */
export const deleteAssignment = (id: string) =>
  httpDelete<Assignment>(API_ENDPOINTS.ASSIGNMENTS.BY_ID(id));
