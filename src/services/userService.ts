import API_ENDPOINTS from "@/config/api";
import type { Role, Paginated } from "@/types/academics";
import { httpGet, httpPost } from "./http";

/**
 * There are no dedicated POST /students or POST /teachers routes — POST /users
 * transactionally creates the user row *and* the matching role profile, so it
 * is the only correct way to provision an account.
 *
 * The role-specific keys are `Joi.forbidden()` on the server for every other
 * role, so sending a stray `roll_number` alongside role=teacher is a 400. Build
 * the payload with `buildCreateUserPayload` rather than spreading form state.
 */
export type CreateUserForm = {
  email: string;
  password: string;
  role: Role;
  department_id: number | "";
  roll_number: string;
  batch: string;
  employee_id: string;
  admin_id: string;
};

export type CreatedUser = {
  id: string;
  email: string;
  role: Role;
  is_active: boolean;
};

export const emptyCreateUserForm = (): CreateUserForm => ({
  email: "",
  password: "",
  role: "student",
  department_id: "",
  roll_number: "",
  batch: "",
  employee_id: "",
  admin_id: "",
});

export const buildCreateUserPayload = (form: CreateUserForm) => {
  const payload: Record<string, unknown> = {
    email: form.email.trim().toLowerCase(),
    password: form.password,
    role: form.role,
    department_id: Number(form.department_id),
  };

  if (form.role === "student") {
    payload.roll_number = form.roll_number.trim();
    if (form.batch) payload.batch = Number(form.batch);
  }

  if (form.role === "teacher") {
    payload.employee_id = form.employee_id.trim();
  }

  if (form.role === "admin" || form.role === "super_admin") {
    payload.admin_id = form.admin_id.trim();
  }

  return payload;
};

export const createUser = (form: CreateUserForm) =>
  httpPost<CreatedUser>(API_ENDPOINTS.USERS.ROOT, buildCreateUserPayload(form));

export type UserRow = {
  id: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
};

export const listUsers = (page = 1, limit = 20) => 
  httpGet<Paginated<UserRow>>(`${API_ENDPOINTS.USERS.ROOT}?page=${page}&limit=${limit}`);

export type AdminProfile = {
  id: string;
  admin_id: string;
  email: string;
  department_id: number | null;
  department_name: string | null;
};

/**
 * The signed-in admin's own profile. Needed because several server rules are
 * scoped to the admin's department — most notably announcements, where posting
 * to any department other than your own is a 403.
 */
export const getMyAdminProfile = () =>
  httpGet<AdminProfile>(API_ENDPOINTS.ADMINS.ME);

/**
 * Client-side mirror of the server's guard: a plain admin cannot mint
 * admin/super_admin accounts, only a super_admin can. Hiding the options avoids
 * a guaranteed 403 round-trip.
 */
export const assignableRoles = (requesterRole: string | undefined): Role[] =>
  requesterRole === "super_admin"
    ? ["student", "teacher", "admin", "super_admin"]
    : ["student", "teacher"];
