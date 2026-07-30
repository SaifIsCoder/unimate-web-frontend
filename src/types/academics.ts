/**
 * Shapes returned by the UniMate API. Field names intentionally mirror the
 * backend's snake_case rows rather than being camelised, so a response can be
 * traced straight back to its SQL without a translation layer.
 */

export type Role = "super_admin" | "admin" | "teacher" | "student";

export type PageMeta = {
  total: number;
  page: number;
  limit: number;
};

export type Paginated<T> = {
  data: T[];
  meta: PageMeta;
};

export type Department = {
  id: number;
  name: string;
  code: string;
  description: string | null;
};

export type Course = {
  id: string;
  code: string;
  title: string;
  credit_hours: number;
  has_practical: boolean;
  department_id: number | null;
  department_name: string | null;
  department_code: string | null;
};

/** Decimal columns arrive from pg as strings — never assume number here. */
export type Offering = {
  id: string;
  course_id: string;
  teacher_id: string | null;
  semester: string;
  section: string;
  capacity: number;
  mid_weight: string;
  sessional_weight: string;
  final_weight: string;
  practical_weight: string;
  course_code: string;
  course_title: string;
  teacher_email: string | null;
};

export type Teacher = {
  id: string;
  user_id: string;
  employee_id: string;
  email: string;
  department_id: number | null;
  department_name: string | null;
};

export type Student = {
  id: string;
  user_id: string;
  roll_number: string;
  batch: number;
  email: string;
  department_id: number | null;
  department_name: string | null;
};

export type EnrollmentStatus = "enrolled" | "dropped";

export type Enrollment = {
  id: string;
  student_id: string;
  offering_id: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  roll_number: string;
  student_email: string;
  batch: number;
  department_id: number | null;
  department_name: string | null;
  semester: string;
  section: string;
  course_code: string;
  course_title: string;
};

export type Announcement = {
  id: string;
  title: string;
  content: string;
  author_id: string;
  department_id: number | null;
  semester: string | null;
  created_at: string;
  is_read?: boolean;
};

export type CampusEvent = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  location: string | null;
  is_upcoming: boolean;
};

// ── Teacher portal ────────────────────────────────────────────────────────────

/** An offering as returned by GET /teachers/me/offerings. */
export type TeachingOffering = {
  id: string;
  course_id: string;
  teacher_id: string;
  semester: string;
  section: string;
  capacity: number;
  course_code: string;
  course_title: string;
  mid_weight: string;
  sessional_weight: string;
  final_weight: string;
  practical_weight: string;
};

export type ScheduleException = {
  exception_id: string;
  schedule_id: string | null;
  date: string;
  exception_type: "cancelled" | "rescheduled" | "extra";
  new_start_time: string | null;
  new_end_time: string | null;
  new_room: string | null;
  course_code: string;
};

export type TeachingSlot = {
  schedule_id: string;
  offering_id: string;
  course_id: string;
  course_code: string;
  course_title: string;
  section: string;
  semester: string;
  room: string | null;
  start_time: string;
  end_time: string;
  capacity: number;
  enrolled_count: number;
  exceptions: ScheduleException[];
};

export type TeachingTimetable = {
  days: Record<string, TeachingSlot[]>;
  exceptions: ScheduleException[];
};

export const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type AttendanceStatus = "present" | "absent" | "late" | "leave";

export type AttendanceSession = {
  id: string;
  offering_id: string;
  date: string;
};

export type AttendanceRecord = {
  id: string;
  session_id: string;
  enrollment_id: string;
  status: AttendanceStatus;
  roll_number: string;
  email: string;
};

export type AttendanceStat = {
  student_id: string;
  roll_number: string;
  total_lectures: number;
  leaves: number;
  adjusted_total: number;
  present: number;
  absent: number;
  late: number;
  attendance_percentage: number;
  eligible_for_exam: boolean;
};

/**
 * Assessment types accepted by POST /grades. The first four resolve their
 * title/max_score from a referenced assignment; the rest require both to be
 * supplied explicitly.
 */
export const ASSESSMENT_TYPES = [
  "midterm",
  "sessional",
  "final",
  "practical",
  "quiz",
  "assignment",
  "presentation",
  "project",
] as const;

export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

/** These derive title + max_score from `reference_id` server-side. */
export const REFERENCE_BACKED_ASSESSMENTS: AssessmentType[] = [
  "assignment",
  "quiz",
  "presentation",
  "project",
];

export type Grade = {
  id: string;
  enrollment_id: string;
  assessment_type: AssessmentType;
  reference_id: string | null;
  title: string;
  score: string;
  max_score: string;
  roll_number: string;
  email: string;
};

export const ASSESSMENT_WEIGHT_FIELDS = [
  "mid_weight",
  "sessional_weight",
  "final_weight",
  "practical_weight",
] as const;

export type AssessmentWeightField = (typeof ASSESSMENT_WEIGHT_FIELDS)[number];

export const WEIGHT_LABELS: Record<AssessmentWeightField, string> = {
  mid_weight: "Mid term",
  sessional_weight: "Sessional",
  final_weight: "Final exam",
  practical_weight: "Practical",
};

// ── Phase 2: people directories ──────────────────────────────────────────────

/**
 * A student as returned by `GET /students/:id`, which joins the user and
 * department rows on top of the base profile.
 */
export type StudentDetail = Student & {
  role?: string;
  department_code: string | null;
  phone: string | null;
  address: string | null;
  father_name: string | null;
  guardian_phone: string | null;
  emergency_phone: string | null;
  /** Decimal column — arrives from pg as a string. */
  target_cgpa: string | null;
  study_intensity: string | null;
  created_at?: string;
};

/** One row of `GET /students/:id/enrollments`. */
export type StudentEnrollment = {
  id: string;
  student_id: string;
  offering_id: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  semester: string;
  section: string;
  course_id: string;
  course_code: string;
  course_title: string;
};

/**
 * `GET /students/semester/:semester` aggregates each student's offerings into a
 * JSON array, so this row shape differs from the plain directory listing.
 */
export type SemesterStudent = Student & {
  department_code?: string | null;
  enrollments: {
    offering_id: string;
    course_title: string;
    course_code: string;
    section: string;
    teacher: string | null;
  }[];
};

/** `GET /teachers/:id` — joins the user row; note it omits department fields. */
export type TeacherDetail = {
  id: string;
  user_id: string;
  employee_id: string;
  email: string;
  role?: string;
  department_id: number | null;
  created_at?: string;
};

/** One row of `GET /teachers/:id/offerings`. */
export type TeacherOffering = {
  id: string;
  course_id: string;
  teacher_id: string | null;
  semester: string;
  section: string;
  capacity: number;
  course_code: string;
  course_title: string;
};

/** `GET /admins` / `GET /admins/:id` — joined with the user and department. */
export type AdminRecord = {
  id: string;
  user_id: string;
  admin_id: string | null;
  department_id: number | null;
  email: string;
  role: string;
  is_active: boolean;
  department_name: string | null;
  department_code: string | null;
  created_at?: string;
};

// ── Phase 3: master timetable ────────────────────────────────────────────────

export const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const EXCEPTION_TYPES = ["cancelled", "rescheduled", "extra"] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

/**
 * A recurring weekly slot, as returned by `GET /schedules/offering/:offeringId`.
 *
 * That endpoint is a plain `SELECT *`, so the primary key is `id` — unlike the
 * student/teacher timetable queries, which alias it to `schedule_id`. Keep the
 * two shapes distinct; conflating them silently breaks delete.
 *
 * `start_time`/`end_time` are Postgres `time` columns and arrive as
 * "HH:mm:ss" strings.
 */
export type ScheduleSlot = {
  id: string;
  offering_id: string;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  room: string | null;
  created_at?: string;
  updated_at?: string;
};

/**
 * A one-off deviation, from `GET /schedules/offering/:offeringId/exceptions`.
 * Also a `SELECT *`, so again the key is `id`.
 *
 * `date` is a Postgres `date`, which node-postgres hydrates into a JS Date and
 * then serialises as a full UTC timestamp ("2026-08-03T00:00:00.000Z"). Never
 * feed it to `new Date()` and read local parts — see `toDateKey` in
 * lib/timetable.ts.
 */
export type OfferingException = {
  id: string;
  offering_id: string;
  schedule_id: string | null;
  date: string;
  exception_type: ExceptionType;
  new_start_time: string | null;
  new_end_time: string | null;
  new_room: string | null;
  created_at?: string;
};

// ── Phase 4: assignments ─────────────────────────────────────────────────────

export const ASSIGNMENT_TYPES = [
  "assignment",
  "quiz",
  "presentation",
  "project",
] as const;

export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

/**
 * An assignment row as returned by the LIST endpoints
 * (`GET /assignments` and `GET /assignments/offering/:offeringId`).
 *
 * `id` is the value Phase 5 must pass to `POST /grades` as `reference_id` —
 * assignment-backed grades are rejected without it, and the server overwrites
 * the grade's title and max score from the referenced assignment.
 *
 * `total_points` is a Decimal column and therefore arrives as a **string**.
 * `difficulty` and `priority` have DB defaults but are absent from both the
 * create and update schemas, so they are read-only from this client.
 */
export type Assignment = {
  id: string;
  offering_id: string;
  title: string;
  description: string | null;
  assessment_type: AssignmentType;
  due_date: string;
  total_points: string;
  is_done: boolean;
  difficulty: string | null;
  priority: string | null;
  created_at?: string;
  updated_at?: string;
};

/** `GET /assignments` additionally joins the offering and course. */
export type AssignmentListRow = Assignment & {
  course_code: string;
  course_title: string;
  semester: string;
  section: string;
};

/**
 * `GET /assignments/:id` — NOT the raw row.
 *
 * The service reshapes it for the mobile client, so field names differ from the
 * list endpoints: `instructions` not `description`, `due` not `due_date`,
 * `maxMarks` not `total_points`. There is no `offering_id`, `is_done` or
 * `assessment_type` here at all, which is why the list row remains the source
 * of truth for the workspace and this is only used for a detail read.
 */
export type AssignmentDetail = {
  id: string;
  title: string;
  instructions: string;
  due: string;
  maxMarks: number;
  difficulty: string | null;
  priority: string | null;
  attachments: unknown[];
  teacherRemarks: string;
  submissionAllowed: boolean;
};
