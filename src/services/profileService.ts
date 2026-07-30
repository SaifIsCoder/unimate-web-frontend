import API_ENDPOINTS from "@/config/api";
import type { AdminRecord } from "@/types/academics";
import { httpGet } from "./http";

/**
 * `GET /auth/me` returns a *role-shaped* object, not a users row — the API
 * branches on role in `user.service.getMe`. These three shapes are what it
 * actually emits, so the UI discriminates rather than guessing.
 */

export type StudentProfile = {
  name: string;
  registrationNumber: string;
  cgpa: number;
  creditsEnrolled: number;
  averageAttendance: number;
  personal: { email: string; phone?: string; address?: string };
  guardian?: { fatherName?: string; phone?: string; emergencyPhone?: string };
  targetCgpa?: number;
  studyIntensity?: string;
};

export type TeacherProfile = {
  name: string;
  employeeId: string;
  personal: { email: string };
};

export type AdminProfile = {
  name: string;
  adminId: string;
  personal: { email: string };
};

export type MeProfile = StudentProfile | TeacherProfile | AdminProfile;

export const isTeacherProfile = (p: MeProfile): p is TeacherProfile =>
  "employeeId" in p;

export const isAdminProfile = (p: MeProfile): p is AdminProfile =>
  "adminId" in p;

export const getMyProfile = () => httpGet<MeProfile>(API_ENDPOINTS.AUTH.ME);

/**
 * Admin profile row (`GET /admins/me`) — carries the department the API uses to
 * scope announcements and community moderation, which `/auth/me` omits.
 *
 * Returns null on 403/404 rather than throwing: a `super_admin` provisioned
 * without an `admins` row is a legitimate state, and the Account page should
 * degrade rather than fail.
 */
// Canonical definition lives in types/academics.ts; re-exported so existing
// imports from this module keep working.
export type { AdminRecord };

export const getMyAdminRecord = async (): Promise<AdminRecord | null> => {
  try {
    return await httpGet<AdminRecord>(API_ENDPOINTS.ADMINS.ME);
  } catch {
    return null;
  }
};
