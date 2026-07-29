const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

const API_VERSION = "v1";

const root = `${API_BASE_URL}/api/${API_VERSION}`;

export const API_ENDPOINTS = {
  BASE_URL: API_BASE_URL,
  AUTH: {
    LOGIN: `${root}/auth/login`,
    REFRESH: `${root}/auth/refresh`,
    LOGOUT: `${root}/auth/logout`,
    ME: `${root}/auth/me`,
    SET_PASSWORD: `${root}/auth/set-password`,
  },
  USERS: {
    ROOT: `${root}/users`,
    BY_ID: (id: string) => `${root}/users/${id}`,
  },
  ADMINS: {
    ME: `${root}/admins/me`,
  },
  DEPARTMENTS: {
    ROOT: `${root}/departments`,
  },
  COURSES: {
    ROOT: `${root}/courses`,
    BY_ID: (id: string) => `${root}/courses/${id}`,
  },
  OFFERINGS: {
    ROOT: `${root}/offerings`,
    BY_ID: (id: string) => `${root}/offerings/${id}`,
  },
  TEACHERS: {
    ROOT: `${root}/teachers`,
    ME: `${root}/teachers/me`,
    MY_OFFERINGS: `${root}/teachers/me/offerings`,
  },
  SCHEDULES: {
    // GET /schedules is student-only; teachers read their timetable from /me.
    MINE: `${root}/schedules/me`,
  },
  GRADES: {
    ROOT: `${root}/grades`,
    BY_OFFERING: (offeringId: string) => `${root}/grades/offering/${offeringId}`,
    CALCULATION: (studentId: string, offeringId: string) =>
      `${root}/grades/student/${studentId}/offering/${offeringId}/calculation`,
  },
  ATTENDANCE: {
    ROOT: `${root}/attendance`,
    SESSIONS_BY_OFFERING: (offeringId: string) =>
      `${root}/attendance/offering/${offeringId}/sessions`,
    SESSION_RECORDS: (sessionId: string) => `${root}/attendance/session/${sessionId}`,
    STATS_BY_OFFERING: (offeringId: string) => `${root}/attendance/offering/${offeringId}`,
  },
  STUDENTS: {
    ROOT: `${root}/students`,
  },
  ENROLLMENTS: {
    ROOT: `${root}/enrollments`,
    BY_ID: (id: string) => `${root}/enrollments/${id}`,
    BY_OFFERING: (offeringId: string) => `${root}/enrollments/offering/${offeringId}`,
  },
  ANNOUNCEMENTS: {
    ROOT: `${root}/announcements`,
    BY_ID: (id: string) => `${root}/announcements/${id}`,
  },
  EVENTS: {
    ROOT: `${root}/events`,
    BY_ID: (id: string) => `${root}/events/${id}`,
  },
};

export default API_ENDPOINTS;
