import API_ENDPOINTS from "@/config/api";
import { normaliseTime } from "@/lib/timetable";
import type {
  DayOfWeek,
  ExceptionType,
  OfferingException,
  ScheduleSlot,
} from "@/types/academics";
import { httpDelete, httpGet, httpPost } from "./http";

/**
 * Master timetable: recurring weekly slots and one-off exceptions.
 *
 * Three things this layer hides from callers:
 *
 * 1. **Times are always sent zero-padded.** The API compares times as strings
 *    and its Joi pattern permits a single-digit hour, so "9:30" defeats its own
 *    overlap check (see `normaliseTime`).
 * 2. **Dates are sent date-only.** `date` is a Postgres `date`; sending a full
 *    timestamp invites an off-by-one-day depending on the viewer's timezone.
 * 3. **Empty optional strings are omitted**, not sent as "". The schema allows
 *    "" but storing a blank room is worse than storing NULL.
 *
 * There is no update endpoint for either resource — changing a slot means
 * delete then create.
 */

// ── Recurring slots ──────────────────────────────────────────────────────────

export type CreateSlotPayload = {
  offering_id: string;
  day_of_week: DayOfWeek;
  /** "HH:mm" or "HH:mm:ss"; padded before sending. */
  start_time: string;
  end_time: string;
  room?: string | null;
};

export const listSlots = (offeringId: string) =>
  httpGet<ScheduleSlot[]>(API_ENDPOINTS.SCHEDULES.BY_OFFERING(offeringId));

/**
 * Creates a weekly slot.
 *
 * Rejects with **409** when it overlaps an existing slot for the *same*
 * offering on the same day. Nothing checks other offerings — see
 * `findCrossOfferingConflicts` for the advisory client-side pass.
 */
export const createSlot = (payload: CreateSlotPayload) =>
  httpPost<ScheduleSlot>(API_ENDPOINTS.SCHEDULES.ROOT, {
    offering_id: payload.offering_id,
    day_of_week: payload.day_of_week,
    start_time: normaliseTime(payload.start_time),
    end_time: normaliseTime(payload.end_time),
    ...(payload.room?.trim() ? { room: payload.room.trim() } : {}),
  });

/** Hard delete. Attached exceptions cascade away with it. */
export const deleteSlot = (id: string) =>
  httpDelete<ScheduleSlot>(API_ENDPOINTS.SCHEDULES.BY_ID(id));

// ── Exceptions ───────────────────────────────────────────────────────────────

export type CreateExceptionPayload = {
  offering_id: string;
  /** Required for cancelled/rescheduled; omitted for an extra class. */
  schedule_id?: string | null;
  /** "YYYY-MM-DD". */
  date: string;
  exception_type: ExceptionType;
  new_start_time?: string | null;
  new_end_time?: string | null;
  new_room?: string | null;
};

export const listExceptions = (offeringId: string) =>
  httpGet<OfferingException[]>(API_ENDPOINTS.SCHEDULES.EXCEPTIONS_BY_OFFERING(offeringId));

/**
 * Creates a cancellation, reschedule or extra class.
 *
 * The API validates that `schedule_id`, when present, belongs to the same
 * offering (400 otherwise). It does *not* prevent two exceptions on the same
 * slot and date, so a cancellation and a reschedule can coexist and contradict
 * each other — the UI warns about that rather than the server.
 */
export const createException = (payload: CreateExceptionPayload) => {
  const body: Record<string, unknown> = {
    offering_id: payload.offering_id,
    // Date-only: the column is a `date`, and a timestamp would risk shifting a day.
    date: payload.date.slice(0, 10),
    exception_type: payload.exception_type,
  };

  // An extra class has no parent slot; sending schedule_id: null is accepted but
  // omitting it keeps the payload honest about intent.
  if (payload.schedule_id) body.schedule_id = payload.schedule_id;

  // Only meaningful for reschedules and extras. Times are padded for the same
  // reason as slots.
  if (payload.new_start_time?.trim()) {
    body.new_start_time = normaliseTime(payload.new_start_time);
  }
  if (payload.new_end_time?.trim()) {
    body.new_end_time = normaliseTime(payload.new_end_time);
  }
  if (payload.new_room?.trim()) body.new_room = payload.new_room.trim();

  return httpPost<OfferingException>(API_ENDPOINTS.SCHEDULES.EXCEPTIONS, body);
};

export const deleteException = (id: string) =>
  httpDelete<OfferingException>(API_ENDPOINTS.SCHEDULES.EXCEPTION_BY_ID(id));
