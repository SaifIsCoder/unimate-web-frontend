import API_ENDPOINTS from "@/config/api";
import type {
  AttendanceRecord,
  AttendanceSession,
  AttendanceStat,
  AttendanceStatus,
  Paginated,
} from "@/types/academics";
import { buildQuery, httpGet, httpPost } from "./http";

/**
 * Attendance: recording and reporting.
 *
 * Extracted from teachingService so the reporting views can be used by admins
 * without pulling in the teacher-only surface.
 */

// ── Sessions ─────────────────────────────────────────────────────────────────

export const listSessions = (offeringId: string) =>
  httpGet<AttendanceSession[]>(API_ENDPOINTS.ATTENDANCE.SESSIONS_BY_OFFERING(offeringId));

/**
 * Every record for one session, joined with the student's roll number and
 * email. Records key off `enrollment_id`, not `student_id` — map back through
 * the roster when matching to a student.
 */
export const getSessionRecords = (sessionId: string) =>
  httpGet<AttendanceRecord[]>(API_ENDPOINTS.ATTENDANCE.SESSION_RECORDS(sessionId));

// ── Reporting ────────────────────────────────────────────────────────────────

/**
 * Per-student attendance statistics for an offering.
 *
 * `eligible_for_exam` is computed **server-side** against the 75% UOS threshold
 * and must never be recalculated here — the server excludes approved leaves
 * from the denominator (`adjusted_total = total_lectures - leaves`), and a
 * client-side reimplementation would drift from the rule that actually governs
 * who may sit the exam.
 *
 * A student calling this only ever sees their own row; admins and the owning
 * teacher see the whole class.
 */
export const getAttendanceStats = (
  offeringId: string,
  { page, limit }: { page?: number; limit?: number } = {},
) =>
  httpGet<Paginated<AttendanceStat>>(
    API_ENDPOINTS.ATTENDANCE.STATS_BY_OFFERING(offeringId) + buildQuery({ page, limit }),
  );

// ── Recording ────────────────────────────────────────────────────────────────

export type RecordAttendancePayload = {
  offering_id: string;
  /** "YYYY-MM-DD". Required whenever `offering_id` is used. */
  date: string;
  /** Only the exceptions — everyone else is defaulted to present server-side. */
  records: { student_id: string; status: AttendanceStatus }[];
};

/**
 * Records attendance for a date.
 *
 * The API marks every actively-enrolled student **present** by default and
 * applies `records` as overrides, so only absences, lates and leaves need
 * sending. It also requires exactly one of `offering_id` or `session_id`, and
 * `date` whenever `offering_id` is used.
 */
export const recordAttendance = (payload: RecordAttendancePayload) =>
  httpPost<{ session: AttendanceSession; records: AttendanceRecord[] }>(
    API_ENDPOINTS.ATTENDANCE.ROOT,
    payload,
  );
