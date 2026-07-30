import API_ENDPOINTS from "@/config/api";
import type {
  Course,
  Department,
  Offering,
  Student,
  Teacher,
} from "@/types/academics";
import { httpDelete, httpGet, httpPatch, httpPost } from "./http";

// ── Departments ───────────────────────────────────────────────────────────────

/**
 * Department ids are INTEGERS — a serial primary key, unlike every other
 * resource in this API, which uses uuids. The route validates with
 * `Joi.number().integer()`, so passing a numeric string still works, but the
 * types here keep it a number so nothing downstream starts treating it as a
 * uuid.
 */
export type DepartmentPayload = {
  name: string;
  code: string;
  description?: string;
};

export const listDepartments = () =>
  httpGet<Department[]>(API_ENDPOINTS.DEPARTMENTS.ROOT);

export const getDepartment = (id: number) =>
  httpGet<Department>(API_ENDPOINTS.DEPARTMENTS.BY_ID(id));

/** `code` is uppercased server-side; we mirror it so the UI shows what is stored. */
export const createDepartment = (payload: DepartmentPayload) =>
  httpPost<Department>(API_ENDPOINTS.DEPARTMENTS.ROOT, payload);

/** At least one field is required — the API rejects an empty patch with 400. */
export const updateDepartment = (id: number, payload: Partial<DepartmentPayload>) =>
  httpPatch<Department>(API_ENDPOINTS.DEPARTMENTS.BY_ID(id), payload);

/**
 * Hard delete. Courses, students, teachers and admins reference departments, so
 * the database may refuse with a foreign-key violation — the caller should
 * surface the API's message rather than assume success.
 */
export const deleteDepartment = (id: number) =>
  httpDelete<Department>(API_ENDPOINTS.DEPARTMENTS.BY_ID(id));

// ── Courses ───────────────────────────────────────────────────────────────────

export type CreateCoursePayload = {
  code: string;
  title: string;
  credit_hours: number;
  department_id: number;
  has_practical: boolean;
};

export const listCourses = () => httpGet<Course[]>(API_ENDPOINTS.COURSES.ROOT);

export const createCourse = (payload: CreateCoursePayload) =>
  httpPost<Course>(API_ENDPOINTS.COURSES.ROOT, payload);

export const deleteCourse = (id: string) =>
  httpDelete<Course>(API_ENDPOINTS.COURSES.BY_ID(id));

// ── Offerings ─────────────────────────────────────────────────────────────────

export type CreateOfferingPayload = {
  course_id: string;
  teacher_id: string | null;
  semester: string;
  section: string;
  capacity: number;
  mid_weight: number;
  sessional_weight: number;
  final_weight: number;
  practical_weight: number;
};

export const listOfferings = () =>
  httpGet<Offering[]>(API_ENDPOINTS.OFFERINGS.ROOT);

export const createOffering = (payload: CreateOfferingPayload) =>
  httpPost<Offering>(API_ENDPOINTS.OFFERINGS.ROOT, payload);

export const updateOffering = (
  id: string,
  payload: Partial<CreateOfferingPayload>,
) => httpPatch<Offering>(API_ENDPOINTS.OFFERINGS.BY_ID(id), payload);

export const deleteOffering = (id: string) =>
  httpDelete<Offering>(API_ENDPOINTS.OFFERINGS.BY_ID(id));

// ── People (read-only lookups used to populate pickers) ───────────────────────

export const listTeachers = () => httpGet<Teacher[]>(API_ENDPOINTS.TEACHERS.ROOT);

export const listStudents = () => httpGet<Student[]>(API_ENDPOINTS.STUDENTS.ROOT);
