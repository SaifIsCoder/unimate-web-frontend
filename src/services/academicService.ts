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

export const listDepartments = () =>
  httpGet<Department[]>(API_ENDPOINTS.DEPARTMENTS.ROOT);

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
