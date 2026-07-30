import API_ENDPOINTS from "@/config/api";
import type { AppNotification } from "@/types/academics";
import { buildQuery, httpGet, httpPatch } from "./http";

/**
 * In-app notifications.
 *
 * These are the DB-backed record of what was pushed: the API writes a row per
 * recipient whenever an announcement is created or updated, then fires the FCM
 * message separately. So the inbox is the durable copy — a user who missed or
 * dismissed the push still sees it here.
 *
 * Notifications are read-only apart from the two read-state mutations. Nothing
 * in the API creates one directly; they only appear as a side effect of an
 * announcement.
 */

/**
 * The caller's notifications, newest first.
 *
 * Returns a **plain array, not a paginated envelope** — unlike most list
 * endpoints here, there is no `meta`, so the total count is unknown and
 * "is there a next page?" can only be inferred from a full page coming back.
 */
export const listNotifications = ({
  page = 1,
  limit = 20,
}: { page?: number; limit?: number } = {}) =>
  httpGet<AppNotification[]>(
    API_ENDPOINTS.NOTIFICATIONS.ROOT + buildQuery({ page, limit }),
  );

/**
 * Marks one notification read.
 *
 * Scoped to the caller's own rows: someone else's id returns 404 ("Notification
 * not found or access denied") rather than 403, so a not-found here is not
 * necessarily a missing row.
 */
export const markNotificationRead = (id: string) =>
  httpPatch<AppNotification>(API_ENDPOINTS.NOTIFICATIONS.READ(id), {});

/** Marks every notification read and returns the updated rows. */
export const markAllNotificationsRead = () =>
  httpPatch<AppNotification[]>(API_ENDPOINTS.NOTIFICATIONS.READ_ALL, {});

/** Unread count, derived — the API exposes no dedicated counter endpoint. */
export const countUnread = (notifications: AppNotification[]): number =>
  notifications.filter((notification) => !notification.is_read).length;
