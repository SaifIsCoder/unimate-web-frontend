import type {
  DayOfWeek,
  OfferingException,
  ScheduleSlot,
} from "@/types/academics";

/**
 * Timetable maths: time normalisation, slot overlap, and the cross-offering
 * conflict checks the API does not perform.
 *
 * Pure functions on purpose — this is the logic most likely to be subtly wrong,
 * and it is fully unit tested in timetable.test.ts.
 */

// ── Time handling ────────────────────────────────────────────────────────────

/**
 * Normalises a time to zero-padded "HH:mm:ss".
 *
 * This is not cosmetic. The API's overlap check compares times as **strings**:
 *
 *     sch.start_time < payload.end_time && sch.end_time > payload.start_time
 *
 * and its Joi pattern accepts a single-digit hour (`[0-1]?[0-9]`). So sending
 * "9:30" makes `"10:00:00" < "9:30"` evaluate true — lexicographically correct,
 * chronologically nonsense — and the server misses a real overlap. Always send
 * padded values.
 */
export const normaliseTime = (value: string): string => {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return value.trim();

  const [, hour, minute, second = "00"] = match;
  return `${hour.padStart(2, "0")}:${minute}:${second}`;
};

/** "HH:mm:ss" → minutes since midnight. Comparing numbers avoids the trap above. */
export const toMinutes = (value: string): number => {
  const [hour = "0", minute = "0"] = normaliseTime(value).split(":");
  return Number(hour) * 60 + Number(minute);
};

/** "09:00:00" → "09:00", for display. */
export const toDisplayTime = (value: string): string => normaliseTime(value).slice(0, 5);

/**
 * The calendar date of an exception, as "YYYY-MM-DD".
 *
 * The API sends a Postgres `date` that node-postgres has already turned into a
 * JS Date and serialised as UTC midnight. Constructing `new Date(...)` and
 * reading local parts shifts the day for anyone west of UTC, so slice the ISO
 * string instead of parsing it.
 */
export const toDateKey = (value: string): string => value.slice(0, 10);

/** Weekday name for a "YYYY-MM-DD" key, computed in UTC to avoid the same shift. */
export const dayOfWeekFor = (dateKey: string): DayOfWeek => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const names: DayOfWeek[] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return names[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
};

// ── Overlap ──────────────────────────────────────────────────────────────────

/**
 * Half-open interval overlap: touching edges do not collide, so a class ending
 * at 10:30 and the next starting at 10:30 is fine. Mirrors the server's
 * `start < otherEnd && end > otherStart`.
 */
export const overlaps = (
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean => toMinutes(aStart) < toMinutes(bEnd) && toMinutes(aEnd) > toMinutes(bStart);

/** True when `end` is not strictly after `start`. */
export const isInvalidRange = (start: string, end: string): boolean =>
  toMinutes(end) <= toMinutes(start);

/**
 * Same-offering, same-day overlap — the exact condition the API rejects with
 * 409. Checking it client-side turns a round trip into instant feedback; the
 * server remains the authority.
 */
export const findSameOfferingOverlap = (
  slots: ScheduleSlot[],
  candidate: { day_of_week: DayOfWeek; start_time: string; end_time: string },
  ignoreSlotId?: string,
): ScheduleSlot | null =>
  slots.find(
    (slot) =>
      slot.id !== ignoreSlotId &&
      slot.day_of_week === candidate.day_of_week &&
      overlaps(slot.start_time, slot.end_time, candidate.start_time, candidate.end_time),
  ) ?? null;

// ── Cross-offering conflicts (advisory) ──────────────────────────────────────

/** One offering's slots, plus the context needed to describe a clash. */
export type IndexedSlot = ScheduleSlot & {
  offering_label: string;
  teacher_id: string | null;
  teacher_email: string | null;
};

export type ConflictKind = "teacher" | "room";

export type Conflict = {
  kind: ConflictKind;
  /** Human-readable subject of the clash: a teacher's email or a room name. */
  subject: string;
  /** The already-scheduled slot being collided with. */
  against: IndexedSlot;
  message: string;
};

/** Rooms are free text, so match case-insensitively and ignore blanks. */
const normaliseRoom = (room: string | null): string | null => {
  const value = (room ?? "").trim().toLowerCase();
  return value === "" ? null : value;
};

/**
 * Teacher double-bookings and room clashes across *other* offerings.
 *
 * The API checks neither: its overlap guard is scoped to a single offering, and
 * rooms are an unconstrained string column with no entity behind them. So these
 * findings are advisory — the UI warns, the user decides. Two rooms genuinely
 * called the same thing, or a deliberate co-taught session, are legitimate.
 *
 * @param index  slots from every offering, including the one being edited
 * @param candidate the slot about to be created
 */
export const findCrossOfferingConflicts = (
  index: IndexedSlot[],
  candidate: {
    offering_id: string;
    day_of_week: DayOfWeek;
    start_time: string;
    end_time: string;
    room: string | null;
    teacher_id: string | null;
    teacher_email: string | null;
  },
): Conflict[] => {
  const conflicts: Conflict[] = [];
  const candidateRoom = normaliseRoom(candidate.room);

  for (const slot of index) {
    // Same-offering clashes are the server's job and are reported separately;
    // reporting them twice would be noise.
    if (slot.offering_id === candidate.offering_id) continue;
    if (slot.day_of_week !== candidate.day_of_week) continue;
    if (!overlaps(slot.start_time, slot.end_time, candidate.start_time, candidate.end_time)) {
      continue;
    }

    if (candidate.teacher_id && slot.teacher_id === candidate.teacher_id) {
      conflicts.push({
        kind: "teacher",
        subject: candidate.teacher_email ?? "This teacher",
        against: slot,
        message: `${candidate.teacher_email ?? "This teacher"} already teaches ${
          slot.offering_label
        } on ${slot.day_of_week} ${toDisplayTime(slot.start_time)}–${toDisplayTime(
          slot.end_time,
        )}.`,
      });
    }

    const slotRoom = normaliseRoom(slot.room);
    if (candidateRoom && slotRoom && slotRoom === candidateRoom) {
      conflicts.push({
        kind: "room",
        subject: candidate.room ?? "",
        against: slot,
        message: `Room ${candidate.room} is already used by ${slot.offering_label} on ${
          slot.day_of_week
        } ${toDisplayTime(slot.start_time)}–${toDisplayTime(slot.end_time)}.`,
      });
    }
  }

  return conflicts;
};

// ── Merging slots with exceptions ────────────────────────────────────────────

export type ResolvedSlot = {
  slot: ScheduleSlot;
  /** Exceptions attached to this slot, soonest first. */
  exceptions: OfferingException[];
  /** Upcoming cancellations, used to strike the slot through in the grid. */
  cancellations: OfferingException[];
  reschedules: OfferingException[];
};

/** Extra classes have no parent slot, so they are surfaced separately. */
export type WeekView = {
  days: Record<DayOfWeek, ResolvedSlot[]>;
  extras: OfferingException[];
  /** Exceptions whose `schedule_id` no longer matches any slot. */
  orphaned: OfferingException[];
};

const EMPTY_DAYS = (): Record<DayOfWeek, ResolvedSlot[]> => ({
  Monday: [],
  Tuesday: [],
  Wednesday: [],
  Thursday: [],
  Friday: [],
  Saturday: [],
  Sunday: [],
});

/**
 * Folds recurring slots and one-off exceptions into a single weekly view.
 *
 * Deleting a schedule cascades its exceptions in the database, but an exception
 * can still reference a slot that is missing from the current response — so
 * unmatched ones are collected into `orphaned` rather than dropped, which would
 * hide real data from the user.
 */
export const buildWeekView = (
  slots: ScheduleSlot[],
  exceptions: OfferingException[],
): WeekView => {
  const days = EMPTY_DAYS();
  const byScheduleId = new Map<string, OfferingException[]>();
  const extras: OfferingException[] = [];

  for (const exception of exceptions) {
    if (exception.exception_type === "extra" || !exception.schedule_id) {
      extras.push(exception);
      continue;
    }
    const bucket = byScheduleId.get(exception.schedule_id) ?? [];
    bucket.push(exception);
    byScheduleId.set(exception.schedule_id, bucket);
  }

  const byDate = (a: OfferingException, b: OfferingException) =>
    toDateKey(a.date).localeCompare(toDateKey(b.date));

  const claimed = new Set<string>();

  for (const slot of slots) {
    const attached = (byScheduleId.get(slot.id) ?? []).sort(byDate);
    attached.forEach((exception) => claimed.add(exception.id));

    days[slot.day_of_week]?.push({
      slot,
      exceptions: attached,
      cancellations: attached.filter((e) => e.exception_type === "cancelled"),
      reschedules: attached.filter((e) => e.exception_type === "rescheduled"),
    });
  }

  for (const list of Object.values(days)) {
    list.sort((a, b) => toMinutes(a.slot.start_time) - toMinutes(b.slot.start_time));
  }

  const orphaned = exceptions.filter(
    (exception) =>
      exception.exception_type !== "extra" &&
      exception.schedule_id !== null &&
      !claimed.has(exception.id),
  );

  return { days, extras: extras.sort(byDate), orphaned };
};
