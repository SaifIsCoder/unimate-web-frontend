"use client";

import React, { useMemo, useState } from "react";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import Button from "@/components/ui/button/Button";
import FormRow from "@/components/admin/FormRow";
import { DAYS_OF_WEEK, type DayOfWeek, type ScheduleSlot } from "@/types/academics";
import {
  findCrossOfferingConflicts,
  findSameOfferingOverlap,
  isInvalidRange,
  toDisplayTime,
  type Conflict,
  type IndexedSlot,
} from "@/lib/timetable";
import type { CreateSlotPayload } from "@/services/scheduleService";

type SlotFormProps = {
  offeringId: string;
  offeringLabel: string;
  teacherId: string | null;
  teacherEmail: string | null;
  /** Slots already on this offering — used for the local 409 preview. */
  existingSlots: ScheduleSlot[];
  /** Slots across every offering. Empty when the index could not be loaded. */
  crossOfferingIndex: IndexedSlot[];
  indexUnavailable?: boolean;
  defaultDay?: DayOfWeek;
  submitting?: boolean;
  /** Server-side failure, notably the 409 overlap. */
  serverError?: string | null;
  onSubmit: (payload: CreateSlotPayload) => void;
  onCancel: () => void;
};

export default function SlotForm({
  offeringId,
  offeringLabel,
  teacherId,
  teacherEmail,
  existingSlots,
  crossOfferingIndex,
  indexUnavailable = false,
  defaultDay = "Monday",
  submitting = false,
  serverError = null,
  onSubmit,
  onCancel,
}: SlotFormProps) {
  const [day, setDay] = useState<DayOfWeek>(defaultDay);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:30");
  const [room, setRoom] = useState("");
  /** Advisory warnings are dismissible; the second submit goes through. */
  const [acknowledged, setAcknowledged] = useState(false);

  const rangeInvalid = isInvalidRange(startTime, endTime);

  /**
   * The same condition the API rejects with 409. Computed locally so the user
   * sees it before submitting; the server still has the final say.
   */
  const sameOfferingClash = useMemo(
    () =>
      rangeInvalid
        ? null
        : findSameOfferingOverlap(existingSlots, {
            day_of_week: day,
            start_time: startTime,
            end_time: endTime,
          }),
    [existingSlots, day, startTime, endTime, rangeInvalid],
  );

  /**
   * Teacher and room clashes with other offerings. The API checks neither, so
   * these are warnings rather than blocks — co-taught sessions and
   * similarly-named rooms are both legitimate.
   */
  const advisory: Conflict[] = useMemo(
    () =>
      rangeInvalid
        ? []
        : findCrossOfferingConflicts(crossOfferingIndex, {
            offering_id: offeringId,
            day_of_week: day,
            start_time: startTime,
            end_time: endTime,
            room,
            teacher_id: teacherId,
            teacher_email: teacherEmail,
          }),
    [crossOfferingIndex, offeringId, day, startTime, endTime, room, teacherId, teacherEmail, rangeInvalid],
  );

  // Hard blocks only: an invalid range, or a clash the server would reject
  // anyway. Advisory conflicts merely require one acknowledgement.
  const blocked = rangeInvalid || sameOfferingClash !== null;
  const needsAcknowledgement = advisory.length > 0 && !acknowledged;

  const handleSubmit = () => {
    if (blocked) return;
    if (needsAcknowledgement) {
      setAcknowledged(true);
      return;
    }

    onSubmit({
      offering_id: offeringId,
      day_of_week: day,
      start_time: startTime,
      end_time: endTime,
      room: room.trim() || null,
    });
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Adding a recurring weekly slot to <strong>{offeringLabel}</strong>.
      </p>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <FormRow label="Day" htmlFor="slot_day" required>
          <Select
            id="slot_day"
            value={day}
            options={DAYS_OF_WEEK.map((value) => ({ value, label: value }))}
            onChange={(value) => {
              setDay(value as DayOfWeek);
              setAcknowledged(false);
            }}
          />
        </FormRow>

        <FormRow label="Room" htmlFor="slot_room" hint="Free text — there is no room registry.">
          <Input
            id="slot_room"
            placeholder="Lab-3"
            value={room}
            onChange={(e) => {
              setRoom(e.target.value);
              setAcknowledged(false);
            }}
          />
        </FormRow>

        <FormRow
          label="Start time"
          htmlFor="slot_start"
          required
          error={rangeInvalid ? "End time must be after the start time." : undefined}
        >
          <Input
            id="slot_start"
            type="time"
            value={startTime}
            error={rangeInvalid}
            onChange={(e) => {
              setStartTime(e.target.value);
              setAcknowledged(false);
            }}
          />
        </FormRow>

        <FormRow label="End time" htmlFor="slot_end" required>
          <Input
            id="slot_end"
            type="time"
            value={endTime}
            error={rangeInvalid}
            onChange={(e) => {
              setEndTime(e.target.value);
              setAcknowledged(false);
            }}
          />
        </FormRow>
      </div>

      {/* Hard block — the server would return 409 for exactly this. */}
      {sameOfferingClash && (
        <div className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 dark:border-error-800 dark:bg-error-500/10">
          <p className="text-sm font-medium text-error-600 dark:text-error-400">
            Overlaps an existing slot on this offering
          </p>
          <p className="mt-1 text-sm text-error-600 dark:text-error-400">
            {day} {toDisplayTime(sameOfferingClash.start_time)}–
            {toDisplayTime(sameOfferingClash.end_time)}
            {sameOfferingClash.room ? ` in ${sameOfferingClash.room}` : ""} is already
            scheduled. The server rejects same-offering overlaps.
          </p>
        </div>
      )}

      {/* The server's own 409, in case its check and ours ever disagree. */}
      {serverError && !sameOfferingClash && (
        <div className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 dark:border-error-800 dark:bg-error-500/10">
          <p className="text-sm text-error-600 dark:text-error-400">{serverError}</p>
        </div>
      )}

      {/* Advisory — dismissible, never a block. */}
      {advisory.length > 0 && (
        <div className="rounded-lg border border-warning-300 bg-warning-50 px-4 py-3 dark:border-warning-700 dark:bg-warning-500/10">
          <p className="text-sm font-medium text-warning-700 dark:text-warning-400">
            {advisory.length === 1 ? "Possible clash" : `${advisory.length} possible clashes`}
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            {advisory.map((conflict, index) => (
              <li
                key={`${conflict.kind}-${conflict.against.id}-${index}`}
                className="text-sm text-warning-700 dark:text-warning-400"
              >
                {conflict.message}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-warning-700 dark:text-warning-400">
            The API does not check across offerings, so this is a warning only —
            press {acknowledged ? "Add slot" : "Add anyway"} to continue.
          </p>
        </div>
      )}

      {indexUnavailable && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Cross-offering clash checking is unavailable — other offerings could not
          be loaded. Same-offering overlaps are still enforced by the server.
        </p>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={blocked || submitting}>
          {submitting ? "Adding…" : needsAcknowledgement ? "Add anyway" : "Add slot"}
        </Button>
      </div>
    </div>
  );
}
