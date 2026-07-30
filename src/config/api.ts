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
    ROOT: `${root}/admins`,
    BY_ID: (id: string) => `${root}/admins/${id}`,
  },
  DEPARTMENTS: {
    ROOT: `${root}/departments`,
    // Department ids are INTEGERS (serial PK), unlike every other resource here
    // which uses a uuid. The API validates with Joi.number().integer().
    BY_ID: (id: number) => `${root}/departments/${id}`,
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
    BY_ID: (id: string) => `${root}/teachers/${id}`,
    OFFERINGS: (id: string) => `${root}/teachers/${id}/offerings`,
  },
  SCHEDULES: {
    // GET /schedules (the collection) is student-only; teachers read their own
    // timetable from /me, and admins go per-offering via BY_OFFERING below.
    MINE: `${root}/schedules/me`,
    ROOT: `${root}/schedules`,
    BY_ID: (id: string) => `${root}/schedules/${id}`,
    BY_OFFERING: (offeringId: string) => `${root}/schedules/offering/${offeringId}`,
    EXCEPTIONS: `${root}/schedules/exceptions`,
    EXCEPTION_BY_ID: (id: string) => `${root}/schedules/exceptions/${id}`,
    EXCEPTIONS_BY_OFFERING: (offeringId: string) =>
      `${root}/schedules/offering/${offeringId}/exceptions`,
  },
  ASSIGNMENTS: {
    ROOT: `${root}/assignments`,
    BY_ID: (id: string) => `${root}/assignments/${id}`,
    BY_OFFERING: (offeringId: string) => `${root}/assignments/offering/${offeringId}`,
    DONE: (id: string) => `${root}/assignments/${id}/done`,
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
    BY_ID: (id: string) => `${root}/students/${id}`,
    ENROLLMENTS: (id: string) => `${root}/students/${id}/enrollments`,
    // The semester segment is free text matched against course_offerings.semester.
    BY_SEMESTER: (semester: string) =>
      `${root}/students/semester/${encodeURIComponent(semester)}`,
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
