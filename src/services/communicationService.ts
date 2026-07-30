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

/**
 * Only the **author** may edit an announcement.
 *
 * The server compares `announcement.author_id` against the caller and 403s
 * anyone else — including admins, who *can* delete another author's post but
 * cannot edit it. Callers should hide the affordance with `canEditAnnouncement`
 * rather than let the user discover this by being rejected.
 *
 * Only `title` and `content` are editable; the audience (offering_ids,
 * department_id, semester) is fixed at creation and the update schema ignores
 * it entirely.
 *
 * Editing **re-notifies every recipient** with an "Updated: " title prefix — the
 * same FCM dispatch as creation. There is no silent-edit option.
 */
export const updateAnnouncement = (
  id: string,
  payload: { title?: string; content?: string },
) => {
  const body: Record<string, unknown> = {};

  // The server ignores empty strings (`if (payload.title)`), so sending one
  // would silently no-op. Omit instead, and let the caller validate.
  if (payload.title?.trim()) body.title = payload.title.trim();
  if (payload.content?.trim()) body.content = payload.content.trim();

  return httpPatch<Announcement>(API_ENDPOINTS.ANNOUNCEMENTS.BY_ID(id), body);
};

/**
 * Records that the current user has read an announcement.
 *
 * Idempotent — the server inserts with `ON CONFLICT DO NOTHING`, so calling it
 * repeatedly is harmless and always reports success.
 */
export const markAnnouncementRead = (id: string) =>
  httpPatch<{ message: string }>(API_ENDPOINTS.ANNOUNCEMENTS.READ(id), {});

/**
 * Whether the signed-in user may edit this announcement.
 *
 * `author_id` is a `users.id`, which is exactly what `AuthUser.id` holds, so
 * this is a direct comparison. Note it is deliberately stricter than delete:
 * an admin may delete anyone's announcement but may only edit their own.
 */
export const canEditAnnouncement = (
  announcement: Pick<Announcement, "author_id">,
  currentUserId: string | undefined,
): boolean => Boolean(currentUserId) && announcement.author_id === currentUserId;

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
