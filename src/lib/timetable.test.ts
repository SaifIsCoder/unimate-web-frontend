import { describe, expect, it } from "vitest";
import {
  buildWeekView,
  dayOfWeekFor,
  findCrossOfferingConflicts,
  findSameOfferingOverlap,
  isInvalidRange,
  normaliseTime,
  overlaps,
  toDateKey,
  toDisplayTime,
  toMinutes,
  type IndexedSlot,
} from "./timetable";
import type { OfferingException, ScheduleSlot } from "@/types/academics";

const slot = (over: Partial<ScheduleSlot> = {}): ScheduleSlot => ({
  id: "slot-1",
  offering_id: "off-1",
  day_of_week: "Monday",
  start_time: "09:00:00",
  end_time: "10:30:00",
  room: "Lab-3",
  ...over,
});

const exception = (over: Partial<OfferingException> = {}): OfferingException => ({
  id: "exc-1",
  offering_id: "off-1",
  schedule_id: "slot-1",
  date: "2026-08-03T00:00:00.000Z",
  exception_type: "cancelled",
  new_start_time: null,
  new_end_time: null,
  new_room: null,
  ...over,
});

const indexed = (over: Partial<IndexedSlot> = {}): IndexedSlot => ({
  ...slot(),
  offering_label: "CS-201 · A",
  teacher_id: "teacher-1",
  teacher_email: "sana.khan@unimate.edu",
  ...over,
});

describe("normaliseTime — guards the API's string comparison", () => {
  it("pads a single-digit hour", () => {
    expect(normaliseTime("9:30")).toBe("09:30:00");
    expect(normaliseTime("9:05:07")).toBe("09:05:07");
  });

  it("adds seconds when absent", () => {
    expect(normaliseTime("09:30")).toBe("09:30:00");
  });

  it("leaves an already-normalised value alone", () => {
    expect(normaliseTime("14:00:00")).toBe("14:00:00");
  });

  it("trims surrounding whitespace", () => {
    expect(normaliseTime("  09:30  ")).toBe("09:30:00");
  });

  it("returns unrecognised input untouched rather than corrupting it", () => {
    expect(normaliseTime("not a time")).toBe("not a time");
  });

  it("fixes the exact comparison the server gets wrong", () => {
    // The API does `sch.start_time < payload.end_time` on raw strings, and its
    // Joi pattern allows "9:30". Unpadded, "10:00:00" < "9:30" is TRUE
    // lexicographically, so a real overlap slips through.
    expect("10:00:00" < "9:30").toBe(true);
    expect(normaliseTime("10:00:00") < normaliseTime("9:30")).toBe(false);
  });
});

describe("toMinutes / toDisplayTime", () => {
  it("converts to minutes since midnight", () => {
    expect(toMinutes("00:00:00")).toBe(0);
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("23:59")).toBe(1439);
  });

  it("handles unpadded input", () => {
    expect(toMinutes("9:30")).toBe(570);
  });

  it("trims seconds for display", () => {
    expect(toDisplayTime("09:30:00")).toBe("09:30");
    expect(toDisplayTime("9:30")).toBe("09:30");
  });
});

describe("toDateKey / dayOfWeekFor — no timezone drift", () => {
  it("slices the ISO string instead of parsing it", () => {
    // node-postgres turns a `date` column into UTC midnight. Parsing it and
    // reading local parts moves the day for anyone west of UTC.
    expect(toDateKey("2026-08-03T00:00:00.000Z")).toBe("2026-08-03");
    expect(toDateKey("2026-08-03")).toBe("2026-08-03");
  });

  it("computes the weekday in UTC", () => {
    expect(dayOfWeekFor("2026-08-03")).toBe("Monday");
    expect(dayOfWeekFor("2026-08-08")).toBe("Saturday");
    expect(dayOfWeekFor("2026-08-09")).toBe("Sunday");
  });
});

describe("overlaps — half-open intervals", () => {
  it("detects a true overlap", () => {
    expect(overlaps("09:00", "10:30", "10:00", "11:00")).toBe(true);
    expect(overlaps("09:00", "10:30", "08:00", "09:30")).toBe(true);
  });

  it("treats touching edges as no clash", () => {
    // Back-to-back classes are normal and must not be flagged.
    expect(overlaps("09:00", "10:30", "10:30", "12:00")).toBe(false);
    expect(overlaps("10:30", "12:00", "09:00", "10:30")).toBe(false);
  });

  it("detects full containment either way", () => {
    expect(overlaps("09:00", "12:00", "10:00", "11:00")).toBe(true);
    expect(overlaps("10:00", "11:00", "09:00", "12:00")).toBe(true);
  });

  it("ignores disjoint ranges", () => {
    expect(overlaps("09:00", "10:00", "14:00", "15:00")).toBe(false);
  });

  it("is immune to the unpadded-hour trap", () => {
    // 09:00–10:00 vs 9:30–10:30 genuinely overlap.
    expect(overlaps("09:00", "10:00", "9:30", "10:30")).toBe(true);
  });
});

describe("isInvalidRange", () => {
  it("rejects an end at or before the start", () => {
    expect(isInvalidRange("10:00", "10:00")).toBe(true);
    expect(isInvalidRange("10:00", "09:00")).toBe(true);
  });

  it("accepts a forward range", () => {
    expect(isInvalidRange("09:00", "10:00")).toBe(false);
  });
});

describe("findSameOfferingOverlap — mirrors the server's 409", () => {
  const existing = [
    slot({ id: "a", day_of_week: "Monday", start_time: "09:00:00", end_time: "10:30:00" }),
    slot({ id: "b", day_of_week: "Wednesday", start_time: "14:00:00", end_time: "15:30:00" }),
  ];

  it("finds a clash on the same day", () => {
    expect(
      findSameOfferingOverlap(existing, {
        day_of_week: "Monday",
        start_time: "10:00",
        end_time: "11:00",
      })?.id,
    ).toBe("a");
  });

  it("ignores a different day at the same time", () => {
    expect(
      findSameOfferingOverlap(existing, {
        day_of_week: "Tuesday",
        start_time: "09:00",
        end_time: "10:30",
      }),
    ).toBeNull();
  });

  it("allows a back-to-back slot", () => {
    expect(
      findSameOfferingOverlap(existing, {
        day_of_week: "Monday",
        start_time: "10:30",
        end_time: "12:00",
      }),
    ).toBeNull();
  });

  it("can exclude a slot being replaced", () => {
    expect(
      findSameOfferingOverlap(
        existing,
        { day_of_week: "Monday", start_time: "09:00", end_time: "10:30" },
        "a",
      ),
    ).toBeNull();
  });
});

describe("findCrossOfferingConflicts — advisory only", () => {
  const index: IndexedSlot[] = [
    indexed({
      id: "other-1",
      offering_id: "off-2",
      offering_label: "MT-101 · B",
      teacher_id: "teacher-1",
      teacher_email: "sana.khan@unimate.edu",
      room: "Room-201",
      day_of_week: "Monday",
      start_time: "09:00:00",
      end_time: "10:30:00",
    }),
  ];

  const candidate = {
    offering_id: "off-1",
    day_of_week: "Monday" as const,
    start_time: "10:00",
    end_time: "11:00",
    room: "Room-201",
    teacher_id: "teacher-1",
    teacher_email: "sana.khan@unimate.edu",
  };

  it("flags a teacher double-booking", () => {
    const found = findCrossOfferingConflicts(index, candidate);
    const teacher = found.find((c) => c.kind === "teacher");
    expect(teacher).toBeDefined();
    expect(teacher!.message).toContain("MT-101 · B");
  });

  it("flags a room clash", () => {
    const found = findCrossOfferingConflicts(index, candidate);
    expect(found.some((c) => c.kind === "room")).toBe(true);
  });

  it("matches rooms case- and whitespace-insensitively", () => {
    const found = findCrossOfferingConflicts(index, { ...candidate, room: "  room-201 " });
    expect(found.some((c) => c.kind === "room")).toBe(true);
  });

  it("never reports the offering being edited — that is the server's 409", () => {
    const found = findCrossOfferingConflicts(index, { ...candidate, offering_id: "off-2" });
    expect(found).toHaveLength(0);
  });

  it("ignores a different day", () => {
    expect(
      findCrossOfferingConflicts(index, { ...candidate, day_of_week: "Tuesday" }),
    ).toHaveLength(0);
  });

  it("ignores non-overlapping times", () => {
    expect(
      findCrossOfferingConflicts(index, {
        ...candidate,
        start_time: "10:30",
        end_time: "12:00",
      }),
    ).toHaveLength(0);
  });

  it("does not treat two blank rooms as the same room", () => {
    const blankIndex = [indexed({ ...index[0], room: "  ", teacher_id: null })];
    expect(
      findCrossOfferingConflicts(blankIndex, {
        ...candidate,
        room: "",
        teacher_id: null,
        teacher_email: null,
      }),
    ).toHaveLength(0);
  });

  it("does not treat two unassigned teachers as the same teacher", () => {
    const unassigned = [indexed({ ...index[0], teacher_id: null, room: null })];
    expect(
      findCrossOfferingConflicts(unassigned, {
        ...candidate,
        teacher_id: null,
        teacher_email: null,
        room: null,
      }),
    ).toHaveLength(0);
  });

  it("reports both kinds when teacher and room clash together", () => {
    expect(findCrossOfferingConflicts(index, candidate)).toHaveLength(2);
  });
});

describe("buildWeekView — merges slots and exceptions", () => {
  it("groups slots by day, sorted by start time", () => {
    const view = buildWeekView(
      [
        slot({ id: "late", start_time: "14:00:00", end_time: "15:00:00" }),
        slot({ id: "early", start_time: "09:00:00", end_time: "10:00:00" }),
      ],
      [],
    );

    expect(view.days.Monday.map((r) => r.slot.id)).toEqual(["early", "late"]);
    expect(view.days.Tuesday).toHaveLength(0);
  });

  it("attaches a cancellation to its slot", () => {
    const view = buildWeekView([slot()], [exception()]);
    const resolved = view.days.Monday[0];

    expect(resolved.cancellations).toHaveLength(1);
    expect(resolved.reschedules).toHaveLength(0);
  });

  it("separates reschedules from cancellations", () => {
    const view = buildWeekView(
      [slot()],
      [
        exception({ id: "c", exception_type: "cancelled" }),
        exception({ id: "r", exception_type: "rescheduled", new_room: "Room-9" }),
      ],
    );
    const resolved = view.days.Monday[0];

    expect(resolved.exceptions).toHaveLength(2);
    expect(resolved.cancellations.map((e) => e.id)).toEqual(["c"]);
    expect(resolved.reschedules.map((e) => e.id)).toEqual(["r"]);
  });

  it("sorts attached exceptions by date", () => {
    const view = buildWeekView(
      [slot()],
      [
        exception({ id: "later", date: "2026-09-01T00:00:00.000Z" }),
        exception({ id: "sooner", date: "2026-08-03T00:00:00.000Z" }),
      ],
    );

    expect(view.days.Monday[0].exceptions.map((e) => e.id)).toEqual(["sooner", "later"]);
  });

  it("routes extra classes to their own bucket", () => {
    const view = buildWeekView(
      [slot()],
      [exception({ id: "x", exception_type: "extra", schedule_id: null })],
    );

    expect(view.extras.map((e) => e.id)).toEqual(["x"]);
    expect(view.days.Monday[0].exceptions).toHaveLength(0);
  });

  it("treats an exception with no schedule_id as an extra", () => {
    const view = buildWeekView(
      [slot()],
      [exception({ id: "loose", exception_type: "cancelled", schedule_id: null })],
    );

    expect(view.extras.map((e) => e.id)).toEqual(["loose"]);
  });

  it("surfaces orphans instead of silently dropping them", () => {
    // An exception pointing at a slot that is not in the response would
    // otherwise vanish from the UI entirely.
    const view = buildWeekView([slot({ id: "real" })], [exception({ schedule_id: "ghost" })]);

    expect(view.orphaned).toHaveLength(1);
    expect(view.days.Monday[0].exceptions).toHaveLength(0);
  });

  it("handles an empty timetable", () => {
    const view = buildWeekView([], []);
    expect(Object.values(view.days).every((d) => d.length === 0)).toBe(true);
    expect(view.extras).toHaveLength(0);
    expect(view.orphaned).toHaveLength(0);
  });
});
