import API_ENDPOINTS from "@/config/api";
import type { Enrollment, EnrollmentStatus, Paginated } from "@/types/academics";
import { buildQuery, httpDelete, httpGet, httpPatch, httpPost } from "./http";

export const listEnrollmentsByOffering = (
  offeringId: string,
  { page = 1, limit = 100 }: { page?: number; limit?: number } = {},
) =>
  httpGet<Paginated<Enrollment>>(
    API_ENDPOINTS.ENROLLMENTS.BY_OFFERING(offeringId) + buildQuery({ page, limit }),
  );

export const enrollStudent = (payload: {
  student_id: string;
  offering_id: string;
  status?: EnrollmentStatus;
}) => httpPost<Enrollment>(API_ENDPOINTS.ENROLLMENTS.ROOT, payload);

export const updateEnrollment = (id: string, payload: { status: EnrollmentStatus }) =>
  httpPatch<Enrollment>(API_ENDPOINTS.ENROLLMENTS.BY_ID(id), payload);

export const removeEnrollment = (id: string) =>
  httpDelete<Enrollment>(API_ENDPOINTS.ENROLLMENTS.BY_ID(id));
