import API_ENDPOINTS from "@/config/api";
import type { Announcement, CampusEvent, Paginated } from "@/types/academics";
import { buildQuery, httpDelete, httpGet, httpPatch, httpPost } from "./http";

// ── Announcements ─────────────────────────────────────────────────────────────

/**
 * The create schema is `.xor("offering_ids", "department_id", "semester")` —
 * exactly ONE target may be sent. Sending two (or none) is a 400, so the UI
 * models the target as a single discriminated choice.
 */
export type BroadcastTarget =
  | { kind: "department"; department_id: number }
  | { kind: "semester"; semester: string }
  | { kind: "offerings"; offering_ids: string[] };

export const buildAnnouncementPayload = (
  title: string,
  content: string,
  target: BroadcastTarget,
) => {
  const base = { title: title.trim(), content: content.trim() };

  switch (target.kind) {
    case "department":
      return { ...base, department_id: target.department_id };
    case "semester":
      return { ...base, semester: target.semester.trim() };
    case "offerings":
      return { ...base, offering_ids: target.offering_ids };
  }
};

export const listAnnouncements = (
  { page = 1, limit = 20 }: { page?: number; limit?: number } = {},
) =>
  httpGet<Paginated<Announcement>>(
    API_ENDPOINTS.ANNOUNCEMENTS.ROOT + buildQuery({ page, limit }),
  );

export const createAnnouncement = (
  title: string,
  content: string,
  target: BroadcastTarget,
) =>
  httpPost<Announcement>(
    API_ENDPOINTS.ANNOUNCEMENTS.ROOT,
    buildAnnouncementPayload(title, content, target),
  );

export const deleteAnnouncement = (id: string) =>
  httpDelete<Announcement>(API_ENDPOINTS.ANNOUNCEMENTS.BY_ID(id));

// ── Events ────────────────────────────────────────────────────────────────────

export type EventPayload = {
  title: string;
  description: string | null;
  date: string;
  location: string | null;
};

export const listEvents = (
  { page = 1, limit = 50 }: { page?: number; limit?: number } = {},
) =>
  httpGet<Paginated<CampusEvent>>(
    API_ENDPOINTS.EVENTS.ROOT + buildQuery({ page, limit }),
  );

export const createEvent = (payload: EventPayload) =>
  httpPost<CampusEvent>(API_ENDPOINTS.EVENTS.ROOT, payload);

export const updateEvent = (id: string, payload: Partial<EventPayload>) =>
  httpPatch<CampusEvent>(API_ENDPOINTS.EVENTS.BY_ID(id), payload);

export const deleteEvent = (id: string) =>
  httpDelete<CampusEvent>(API_ENDPOINTS.EVENTS.BY_ID(id));
