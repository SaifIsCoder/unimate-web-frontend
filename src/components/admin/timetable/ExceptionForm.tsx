"use client";

import React, { useMemo, useState } from "react";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import Button from "@/components/ui/button/Button";
import FormRow from "@/components/admin/FormRow";
import type { ExceptionType, OfferingException, ScheduleSlot } from "@/types/academics";
import { dayOfWeekFor, isInvalidRange, toDateKey, toDisplayTime } from "@/lib/timetable";
import type { CreateExceptionPayload } from "@/services/scheduleService";

type ExceptionFormProps = {
  offeringId: string;
  /** The slot being altered. Null when adding a standalone extra class. */
  slot: ScheduleSlot | null;
  /** Existing exceptions on this slot, used to catch contradictory entries. */
  existing: OfferingException[];
  submitting?: boolean;
  serverError?: string | null;
  onSubmit: (payload: CreateExceptionPayload) => void;
  onCancel: () => void;
};

const TYPE_OPTIONS: { value: ExceptionType; label: string; hint: string }[] = [
  {
    value: "cancelled",
    label: "Cancelled",
    hint: "The class does not run on this date.",
  },
  {
    value: "rescheduled",
    label: "Rescheduled",
    hint: "Same date, different time or room.",
  },
  {
    value: "extra",
    label: "Extra class",
    hint: "An additional session with no recurring slot.",
  },
];

const todayKey = () => new Date().toISOString().slice(0, 10);

export default function ExceptionForm({
  offeringId,
  slot,
  existing,
  submitting = false,
  serverError = null,
  onSubmit,
  onCancel,
}: ExceptionFormProps) {
  // With no parent slot the only sensible type is an extra class.
  const [type, setType] = useState<ExceptionType>(slot ? "cancelled" : "extra");
  const [date, setDate] = useState(todayKey());
  const [newStart, setNewStart] = useState(slot ? toDisplayTime(slot.start_time) : "09:00");
  const [newEnd, setNewEnd] = useState(slot ? toDisplayTime(slot.end_time) : "10:30");
  const [newRoom, setNewRoom] = useState(slot?.room ?? "");

  const needsTimes = type === "rescheduled" || type === "extra";
  const rangeInvalid = needsTimes && isInvalidRange(newStart, newEnd);

  /**
   * A recurring slot only exists on its own weekday, so cancelling it on a
   * Tuesday when it runs on Mondays would store a row that never matches
   * anything. The API does not check this.
   */
  const weekdayMismatch = useMemo(() => {
    if (!slot || type === "extra" || !date) return null;
    const actual = dayOfWeekFor(date);
    return actual === slot.day_of_week ? null : actual;
  }, [slot, type, date]);

  /**
   * The API happily accepts a cancellation and a reschedule for the same slot
   * and date, which then contradict each other.
   */
  const duplicate = useMemo(
    () => existing.find((exception) => toDateKey(exception.date) === date) ?? null,
    [existing, date],
  );

  const blocked = rangeInvalid || weekdayMismatch !== null;

  const handleSubmit = () => {
    if (blocked) return;

    onSubmit({
      offering_id: offeringId,
      // An extra class is deliberately unattached, even when opened from a slot.
      schedule_id: type === "extra" ? null : slot?.id ?? null,
      date,
      exception_type: type,
      ...(needsTimes ? { new_start_time: newStart, new_end_time: newEnd } : {}),
      ...(needsTimes && newRoom.trim() ? { new_room: newRoom.trim() } : {}),
    });
  };

  const activeHint = TYPE_OPTIONS.find((option) => option.value === type)?.hint;

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {slot ? (
          <>
            Altering the <strong>{slot.day_of_week}</strong>{" "}
            {toDisplayTime(slot.start_time)}–{toDisplayTime(slot.end_time)} slot.
          </>
        ) : (
          "Adding a one-off extra class."
        )}
      </p>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <FormRow label="Type" htmlFor="exception_type" required hint={activeHint}>
          <Select
            id="exception_type"
            value={type}
            options={TYPE_OPTIONS.filter((option) => slot || option.value === "extra").map(
              ({ value, label }) => ({ value, label }),
            )}
            onChange={(value) => setType(value as ExceptionType)}
          />
        </FormRow>

        <FormRow
          label="Date"
          htmlFor="exception_date"
          required
          error={
            weekdayMismatch
              ? `That date is a ${weekdayMismatch}, but this slot runs on ${slot?.day_of_week}.`
              : undefined
          }
        >
          <Input
            id="exception_date"
            type="date"
            value={date}
            error={Boolean(weekdayMismatch)}
            onChange={(e) => setDate(e.target.value)}
          />
        </FormRow>

        {needsTimes && (
          <>
            <FormRow
              label="New start time"
              htmlFor="exception_start"
              required
              error={rangeInvalid ? "End time must be after the start time." : undefined}
            >
              <Input
                id="exception_start"
                type="time"
                value={newStart}
                error={rangeInvalid}
                onChange={(e) => setNewStart(e.target.value)}
              />
            </FormRow>

            <FormRow label="New end time" htmlFor="exception_end" required>
              <Input
                id="exception_end"
                type="time"
                value={newEnd}
                error={rangeInvalid}
                onChange={(e) => setNewEnd(e.target.value)}
              />
            </FormRow>

            <FormRow label="Room" htmlFor="exception_room">
              <Input
                id="exception_room"
                placeholder="Room-201"
                value={newRoom}
                onChange={(e) => setNewRoom(e.target.value)}
              />
            </FormRow>
          </>
        )}
      </div>

      {duplicate && !weekdayMismatch && (
        <div className="rounded-lg border border-warning-300 bg-warning-50 px-4 py-3 dark:border-warning-700 dark:bg-warning-500/10">
          <p className="text-sm text-warning-700 dark:text-warning-400">
            There is already a <strong>{duplicate.exception_type}</strong> entry for{" "}
            {toDateKey(duplicate.date)}. Adding another will leave two conflicting
            records on the same date — remove the existing one first unless that is
            intended.
          </p>
        </div>
      )}

      {serverError && (
        <div className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 dark:border-error-800 dark:bg-error-500/10">
          <p className="text-sm text-error-600 dark:text-error-400">{serverError}</p>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={blocked || submitting}>
          {submitting ? "Saving…" : "Save exception"}
        </Button>
      </div>
    </div>
  );
}
