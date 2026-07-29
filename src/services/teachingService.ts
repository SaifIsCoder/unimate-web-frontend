import API_ENDPOINTS from "@/config/api";
import type {
  AttendanceRecord,
  AttendanceSession,
  AttendanceStat,
  AttendanceStatus,
  AssessmentType,
  Grade,
  Paginated,
  TeachingOffering,
  TeachingTimetable,
} from "@/types/academics";
import { buildQuery, httpGet, httpPost } from "./http";

// ── The teacher's own classes ─────────────────────────────────────────────────

export const listMyOfferings = () =>
  httpGet<TeachingOffering[]>(API_ENDPOINTS.TEACHERS.MY_OFFERINGS);

export const getMyTimetable = () =>
  httpGet<TeachingTimetable>(API_ENDPOINTS.SCHEDULES.MINE);

// ── Attendance ────────────────────────────────────────────────────────────────

export const listSessions = (offeringId: string) =>
  httpGet<AttendanceSession[]>(API_ENDPOINTS.ATTENDANCE.SESSIONS_BY_OFFERING(offeringId));

export const getSessionRecords = (sessionId: string) =>
  httpGet<AttendanceRecord[]>(API_ENDPOINTS.ATTENDANCE.SESSION_RECORDS(sessionId));

export const getAttendanceStats = (
  offeringId: string,
  { page = 1, limit = 100 }: { page?: number; limit?: number } = {},
) =>
  httpGet<{ data: AttendanceStat[]; meta: { total: number } }>(
    API_ENDPOINTS.ATTENDANCE.STATS_BY_OFFERING(offeringId) + buildQuery({ page, limit }),
  );

/**
 * The body is `.xor("offering_id", "session_id").with("offering_id", "date")`,
 * so an offering must be paired with a date and may not carry a session id.
 *
 * The service defaults every actively enrolled student to `present` and then
 * applies `records` on top, so sending the full roster is safe and makes the
 * submitted state match exactly what the teacher saw.
 */
export const recordAttendance = (payload: {
  offering_id: string;
  date: string;
  records: { student_id: string; status: AttendanceStatus }[];
}) =>
  httpPost<{ session: AttendanceSession; records: AttendanceRecord[] }>(
    API_ENDPOINTS.ATTENDANCE.ROOT,
    payload,
  );

// ── Grades ────────────────────────────────────────────────────────────────────

export const listGradesByOffering = (
  offeringId: string,
  { page = 1, limit = 100 }: { page?: number; limit?: number } = {},
) =>
  httpGet<Paginated<Grade>>(
    API_ENDPOINTS.GRADES.BY_OFFERING(offeringId) + buildQuery({ page, limit }),
  );

export type SubmitGradePayload = {
  offering_id: string;
  student_id: string;
  assessment_type: AssessmentType;
  title: string;
  score: number;
  max_score: number;
};

/** POST /grades takes ONE student per call — there is no bulk endpoint. */
export const submitGrade = (payload: SubmitGradePayload) =>
  httpPost<Grade>(API_ENDPOINTS.GRADES.ROOT, payload);

export type BulkGradeOutcome = {
  submitted: number;
  failures: { studentId: string; rollNumber: string; message: string }[];
};

/**
 * Saves a column of scores by issuing one request per student. Requests run
 * sequentially: a class-sized burst of parallel writes would trip the API's
 * rate limiter, and sequential failures are far easier to report per-row.
 */
export const submitGradeColumn = async (
  base: Omit<SubmitGradePayload, "student_id" | "score">,
  entries: { studentId: string; rollNumber: string; score: number }[],
): Promise<BulkGradeOutcome> => {
  const outcome: BulkGradeOutcome = { submitted: 0, failures: [] };

  for (const entry of entries) {
    try {
      await submitGrade({ ...base, student_id: entry.studentId, score: entry.score });
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
