import API_ENDPOINTS from "@/config/api";
import type {
  AssessmentType,
  Grade,
  GradeCalculation,
  Paginated,
  Transcript,
} from "@/types/academics";
import { REFERENCE_BACKED_ASSESSMENTS } from "@/types/academics";
import { buildQuery, httpGet, httpPost } from "./http";

/**
 * Gradebook.
 *
 * The one rule that governs this whole module: `POST /grades` takes **two
 * mutually exclusive payload shapes**, decided by `assessment_type`. Sending
 * the wrong one is not a validation warning — it is a 400 or a 404.
 */

// ── The payload split ────────────────────────────────────────────────────────

/**
 * assignment · quiz · presentation · project.
 *
 * `reference_id` is **required** and must point at an assignment belonging to
 * the same offering:
 *   - missing        → 400 "Reference ID is required for {type} grades"
 *   - unknown id     → 404 "Referenced assessment not found"
 *   - wrong offering → 400 "Referenced assessment does not belong to this offering"
 *
 * `title` and `max_score` are deliberately absent. The server overwrites both
 * from the referenced assignment, so sending them is at best ignored and at
 * worst misleading to whoever reads the call site next.
 */
export type ReferenceBackedGradePayload = {
  offering_id: string;
  student_id: string;
  assessment_type: Extract<
    AssessmentType,
    "assignment" | "quiz" | "presentation" | "project"
  >;
  reference_id: string;
  score: number;
};

/**
 * sessional · midterm · final · practical.
 *
 * `title` and `max_score` are **required** — there is no assignment to inherit
 * them from — and `reference_id` must be omitted. These upsert on
 * (enrollment_id, assessment_type), so a student has at most one of each and
 * re-submitting overwrites.
 */
export type DirectGradePayload = {
  offering_id: string;
  student_id: string;
  assessment_type: Extract<
    AssessmentType,
    "sessional" | "midterm" | "final" | "practical"
  >;
  title: string;
  max_score: number;
  score: number;
};

export type SubmitGradePayload = ReferenceBackedGradePayload | DirectGradePayload;

export const isReferenceBacked = (type: AssessmentType): boolean =>
  REFERENCE_BACKED_ASSESSMENTS.includes(type);

/**
 * Narrowing helper — lets callers branch on the payload without re-deriving the
 * rule from `assessment_type`.
 */
export const isReferenceBackedPayload = (
  payload: SubmitGradePayload,
): payload is ReferenceBackedGradePayload => isReferenceBacked(payload.assessment_type);

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Records one student's score. There is no bulk endpoint.
 *
 * The payload is rebuilt field by field rather than spread, so a stray
 * `reference_id` on a direct grade — or a leftover `max_score` on a
 * reference-backed one — cannot leak through from caller state.
 *
 * Common rejections:
 *   - 400 the student is not actively enrolled in this offering
 *   - 400 score exceeds max_score
 *   - 403 the teacher does not own this offering
 */
export const submitGrade = (payload: SubmitGradePayload) => {
  const body: Record<string, unknown> = {
    offering_id: payload.offering_id,
    student_id: payload.student_id,
    assessment_type: payload.assessment_type,
    score: payload.score,
  };

  if (isReferenceBackedPayload(payload)) {
    body.reference_id = payload.reference_id;
  } else {
    body.title = payload.title.trim();
    body.max_score = payload.max_score;
  }

  return httpPost<Grade>(API_ENDPOINTS.GRADES.ROOT, body);
};

export type BulkGradeOutcome = {
  submitted: number;
  failures: { studentId: string; rollNumber: string; message: string }[];
};

/**
 * Saves a column of scores by issuing one request per student.
 *
 * Sequential on purpose: a class-sized burst of parallel writes would trip the
 * API's 100-per-15-minutes limiter, and per-row failures are far easier to
 * report when they arrive in order. A failure does not abort the run — the
 * remaining students are still saved and every failure is returned.
 */
export const submitGradeColumn = async (
  base: Omit<ReferenceBackedGradePayload, "student_id" | "score">
    | Omit<DirectGradePayload, "student_id" | "score">,
  entries: { studentId: string; rollNumber: string; score: number }[],
): Promise<BulkGradeOutcome> => {
  const outcome: BulkGradeOutcome = { submitted: 0, failures: [] };

  for (const entry of entries) {
    try {
      await submitGrade({
        ...base,
        student_id: entry.studentId,
        score: entry.score,
      } as SubmitGradePayload);
      outcome.submitted += 1;
    } catch (error) {
      outcome.failures.push({
        studentId: entry.studentId,
        rollNumber: entry.rollNumber,
        message: error instanceof Error ? error.message : "Request failed",
      });
    }
  }

  return outcome;
};

// ── Reads ────────────────────────────────────────────────────────────────────

export const listGradesByOffering = (
  offeringId: string,
  { page = 1, limit = 100 }: { page?: number; limit?: number } = {},
) =>
  httpGet<Paginated<Grade>>(
    API_ENDPOINTS.GRADES.BY_OFFERING(offeringId) + buildQuery({ page, limit }),
  );

/**
 * The weighted calculation for one student on one offering.
 *
 * Applies the offering's mid/sessional/final/practical weights to each
 * component percentage, rounds **up** to `final_marks`, then maps that to a
 * letter and grade point. Admins and the owning teacher may call it; a student
 * may only request their own.
 */
export const getGradeCalculation = (studentId: string, offeringId: string) =>
  httpGet<GradeCalculation>(API_ENDPOINTS.GRADES.CALCULATION(studentId, offeringId));

/**
 * Full transcript with CGPA.
 *
 * **Admin only** — the API explicitly rejects teachers with 403 ("You are not
 * authorized to view student transcripts"), so this must never be called from
 * the teacher workspace.
 *
 * Only actively enrolled offerings are included, so a dropped course silently
 * disappears from the CGPA rather than counting as a fail.
 */
export const getStudentTranscript = (studentId: string) =>
  httpGet<Transcript>(API_ENDPOINTS.GRADES.TRANSCRIPT(studentId));
