import { describe, expect, it } from "vitest";
import { canEditAnnouncement } from "@/services/communicationService";
import { countUnread } from "@/services/notificationService";
import type { AppNotification, Announcement } from "@/types/academics";

const announcement = (over: Partial<Announcement> = {}): Announcement => ({
  id: "ann-1",
  title: "Midterm schedule",
  content: "The datesheet is published.",
  author_id: "user-author",
  department_id: 1,
  semester: null,
  created_at: "2026-07-30T09:00:00.000Z",
  ...over,
});

const notification = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: "n1",
  user_id: "user-1",
  type: "announcement",
  title: "New Announcement: Midterm schedule",
  message: "The datesheet is published.",
  reference_id: "ann-1",
  is_read: false,
  created_at: "2026-07-30T09:00:00.000Z",
  ...over,
});

describe("canEditAnnouncement — author-only, stricter than delete", () => {
  it("allows the author", () => {
    expect(canEditAnnouncement(announcement(), "user-author")).toBe(true);
  });

  it("denies a different user", () => {
    expect(canEditAnnouncement(announcement(), "user-other")).toBe(false);
  });

  it("denies an admin who did not write it", () => {
    // The server lets any admin DELETE another author's announcement but never
    // edit it. Role is deliberately not a factor here — only identity.
    expect(canEditAnnouncement(announcement({ author_id: "someone-else" }), "admin-user")).toBe(
      false,
    );
  });

  it("denies when the viewer is unknown", () => {
    expect(canEditAnnouncement(announcement(), undefined)).toBe(false);
    expect(canEditAnnouncement(announcement(), "")).toBe(false);
  });

  it("does not treat an empty author_id as a wildcard", () => {
    // A malformed row must not accidentally grant edit rights to a signed-out
    // viewer, or to everyone.
    expect(canEditAnnouncement(announcement({ author_id: "" }), "")).toBe(false);
    expect(canEditAnnouncement(announcement({ author_id: "" }), "user-1")).toBe(false);
  });

  it("compares exactly — no case folding or trimming", () => {
    expect(canEditAnnouncement(announcement({ author_id: "User-Author" }), "user-author")).toBe(
      false,
    );
    expect(canEditAnnouncement(announcement({ author_id: " user-author" }), "user-author")).toBe(
      false,
    );
  });
});

describe("countUnread", () => {
  it("counts only unread rows", () => {
    expect(
      countUnread([
        notification({ id: "a", is_read: false }),
        notification({ id: "b", is_read: true }),
        notification({ id: "c", is_read: false }),
      ]),
    ).toBe(2);
  });

  it("returns zero for an empty inbox", () => {
    expect(countUnread([])).toBe(0);
  });

  it("returns zero when everything is read", () => {
    expect(countUnread([notification({ is_read: true })])).toBe(0);
  });

  it("reads the snake_case field, not the mobile alias", () => {
    // The API emits both is_read and isRead. If they ever disagree, the raw
    // column is the one to trust — the alias exists for a different client.
    expect(countUnread([notification({ is_read: true, isRead: false })])).toBe(0);
  });
});
