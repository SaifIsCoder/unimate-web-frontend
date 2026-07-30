"use client";

import React, { useEffect, useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { errorMessage } from "@/components/admin/FeedbackBanner";
import {
  countUnread,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/notificationService";
import type { AppNotification } from "@/types/academics";

/** "3 minutes ago" without pulling in a date library for one string. */
const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString();
};

/**
 * Notification inbox.
 *
 * Lives in the global header so it is reachable from every screen — these are
 * announcements the user may have missed, not a destination they would navigate
 * to deliberately.
 *
 * Fetched when the panel opens rather than on mount. The API allows 100
 * requests / 15 min per IP and this component renders on every page, so polling
 * or eager loading would spend a meaningful share of that budget on users who
 * never open it.
 */
export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * How many times the panel has been opened, and how many of those fetches
   * have settled. Loading is derived from the difference rather than held as
   * its own flag, which would need a synchronous setState inside the effect.
   */
  const [openCount, setOpenCount] = useState(0);
  const [settledCount, setSettledCount] = useState(0);

  const loading = settledCount < openCount;
  const loaded = settledCount > 0;

  const unread = countUnread(notifications);

  // Refetches each time the panel opens, so it never shows a stale inbox.
  // `openCount` is the trigger; nothing is set synchronously in the effect.
  useEffect(() => {
    if (openCount === 0) return;

    let alive = true;

    void (async () => {
      try {
        const rows = await listNotifications({ limit: 20 });
        if (!alive) return;
        setNotifications(rows);
        setError(null);
      } catch (caught) {
        if (alive) setError(errorMessage(caught, "Could not load notifications."));
      } finally {
        // Settles whether it succeeded or failed, so a failure does not spin.
        if (alive) setSettledCount(openCount);
      }
    })();

    return () => {
      alive = false;
    };
  }, [openCount]);

  const handleMarkRead = async (notification: AppNotification) => {
    if (notification.is_read) return;

    // Optimistic: the request is idempotent and a failure only means the dot
    // reappears on the next open.
    setNotifications((previous) =>
      previous.map((row) => (row.id === notification.id ? { ...row, is_read: true } : row)),
    );

    try {
      await markNotificationRead(notification.id);
    } catch {
      setNotifications((previous) =>
        previous.map((row) =>
          row.id === notification.id ? { ...row, is_read: false } : row,
        ),
      );
    }
  };

  const handleMarkAll = async () => {
    setBusy(true);
    try {
      const updated = await markAllNotificationsRead();
      // The endpoint returns the updated rows, so trust them over a local guess.
      setNotifications(updated);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught, "Could not mark everything as read."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="dropdown-toggle relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={() => {
          setIsOpen((open) => {
            // Bumping the counter from the handler (not an effect) is what
            // triggers the refetch.
            if (!open) setOpenCount((count) => count + 1);
            return !open;
          });
        }}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {/* The dot only appears once there is real data behind it — an
            indicator with nothing behind it is worse than none. */}
        {loaded && unread > 0 && (
          <span className="absolute right-0 top-0.5 z-10 flex h-2 w-2 rounded-full bg-orange-400">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
          </span>
        )}
        <svg
          className="fill-current"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="absolute -right-[240px] mt-[17px] flex max-h-[480px] w-[350px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[380px] lg:right-0"
      >
        <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-700">
          <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Notifications
            {unread > 0 && (
              <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-400">
                {unread}
              </span>
            )}
          </h5>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Close notifications"
          >
            <svg
              className="fill-current"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>

        {loading && (
          <div className="space-y-2 p-2" aria-hidden="true">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
              />
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="px-4 py-6 text-center text-sm text-error-600 dark:text-error-400">
            {error}
          </p>
        )}

        {!loading && !error && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1 px-4 py-10 text-center">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              No notifications
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Announcements sent to you will appear here.
            </p>
          </div>
        )}

        {!loading && !error && notifications.length > 0 && (
          <>
            <ul className="flex-1 space-y-1 overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => void handleMarkRead(notification)}
                    className={`flex w-full gap-3 rounded-lg p-3 text-left transition hover:bg-gray-50 dark:hover:bg-white/5 ${
                      notification.is_read ? "" : "bg-brand-50/60 dark:bg-brand-500/10"
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        notification.is_read ? "bg-transparent" : "bg-brand-500"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-sm ${
                          notification.is_read
                            ? "text-gray-600 dark:text-gray-400"
                            : "font-semibold text-gray-800 dark:text-white/90"
                        }`}
                      >
                        {notification.title}
                      </span>
                      <span className="mt-0.5 block line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                        {notification.message}
                      </span>
                      <span className="mt-1 block text-[11px] text-gray-400">
                        {relativeTime(notification.created_at)}
                        {!notification.is_read && " · click to mark read"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-700">
              <button
                type="button"
                onClick={() => void handleMarkAll()}
                disabled={busy || unread === 0}
                className="w-full rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              >
                {busy
                  ? "Marking…"
                  : unread === 0
                  ? "All caught up"
                  : `Mark all ${unread} as read`}
              </button>
            </div>
          </>
        )}
      </Dropdown>
    </div>
  );
}
