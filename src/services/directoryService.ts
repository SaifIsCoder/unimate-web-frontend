import API_ENDPOINTS from "@/config/api";
import type {
  AdminRecord,
  SemesterStudent,
  Student,
  StudentDetail,
  StudentEnrollment,
  Teacher,
  TeacherDetail,
  TeacherOffering,
  Paginated,
} from "@/types/academics";
import { httpDelete, httpGet, httpPatch } from "./http";

/**
 * People directories: students, faculty and administrators.
 *
 * As elsewhere, this layer owns the API's rules so pages never have to know
 * them. Two are worth reading before using the update functions.
 */

// ── Students (admin-only; read-only in this phase) ───────────────────────────

export const listStudents = (page = 1, limit = 20) =>
  httpGet<Paginated<Student>>(`${API_ENDPOINTS.STUDENTS.ROOT}?page=${page}&limit=${limit}`);

export const getStudent = (id: string) =>
  httpGet<StudentDetail>(API_ENDPOINTS.STUDENTS.BY_ID(id));

export const getStudentEnrollments = (id: string) =>
  httpGet<StudentEnrollment[]>(API_ENDPOINTS.STUDENTS.ENROLLMENTS(id));

/**
 * Students actively enrolled in a given semester, each with their offerings
 * aggregated into an array. Only `status = 'enrolled'` rows are counted, so a
 * student who dropped every course will not appear at all.
 */
export const listStudentsBySemester = (semester: string) =>
  httpGet<SemesterStudent[]>(API_ENDPOINTS.STUDENTS.BY_SEMESTER(semester));

// ── Faculty ──────────────────────────────────────────────────────────────────

export const listTeachers = (page = 1, limit = 20) => 
  httpGet<Paginated<Teacher>>(`${API_ENDPOINTS.TEACHERS.ROOT}?page=${page}&limit=${limit}`);

/**
 * Note this returns *less* than the list endpoint: `GET /teachers/:id` joins
 * only the user row, so `department_name` is absent. Resolve the name from the
 * departments list using `department_id` when you need it.
 */
export const getTeacher = (id: string) =>
  httpGet<TeacherDetail>(API_ENDPOINTS.TEACHERS.BY_ID(id));

export const getTeacherOfferings = (id: string) =>
  httpGet<TeacherOffering[]>(API_ENDPOINTS.TEACHERS.OFFERINGS(id));

/**
 * Only `employee_id` is exposed.
 *
 * The API's `updateTeacherBody` also accepts a free-text `department` string,
 * but the `teachers` table has no such column — only `department_id` (integer
 * FK). The repository builds `UPDATE teachers SET department = $1` from the
 * payload keys verbatim, so sending it produces a SQL error, not a 400.
 * Reassigning a department therefore has no working endpoint today; tracked as
 * BE-8. `user_id` is deliberately not exposed either: repointing a teacher
 * profile at a different user account is a data-integrity hazard, not an edit.
 */
export const updateTeacher = (id: string, payload: { employee_id: string }) =>
  httpPatch<TeacherDetail>(API_ENDPOINTS.TEACHERS.BY_ID(id), payload);

/**
 * Hard-deletes the teacher profile. The underlying `users` row survives, so the
 * account can still authenticate but will have no teacher profile — deactivate
 * the user as well if the intent is to remove them entirely.
 */
export const deleteTeacher = (id: string) =>
  httpDelete<{ message: string }>(API_ENDPOINTS.TEACHERS.BY_ID(id));

// ── Administrators ───────────────────────────────────────────────────────────

export const listAdmins = (page = 1, limit = 20) => 
  httpGet<Paginated<AdminRecord>>(`${API_ENDPOINTS.ADMINS.ROOT}?page=${page}&limit=${limit}`);

export const getAdmin = (id: string) =>
  httpGet<AdminRecord>(API_ENDPOINTS.ADMINS.BY_ID(id));

/**
 * Only `admin_id` is exposed, for the same reason as `updateTeacher`: the
 * schema's `department` field does not match any column on `admins`.
 */
export const updateAdmin = (id: string, payload: { admin_id: string }) =>
  httpPatch<AdminRecord>(API_ENDPOINTS.ADMINS.BY_ID(id), payload);

/**
 * Hard-deletes the admin profile, leaving the `users` row intact.
 *
 * The route is gated on `admin` rather than `super_admin`, so the API alone
 * would let one admin delete another. The dashboard restricts the whole
 * directory to super admins, which is the stricter and intended rule.
 */
export const deleteAdmin = (id: string) =>
  httpDelete<null>(API_ENDPOINTS.ADMINS.BY_ID(id));
