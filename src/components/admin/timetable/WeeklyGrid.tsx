"use client";

import React from "react";
import Badge from "@/components/ui/badge/Badge";
import { DAYS_OF_WEEK, type OfferingException } from "@/types/academics";
import {
  toDateKey,
  toDisplayTime,
  type ResolvedSlot,
  type WeekView,
} from "@/lib/timetable";

type WeeklyGridProps = {
  view: WeekView;
  loading?: boolean;
  error?: string | null;
  onAddSlot: (day: (typeof DAYS_OF_WEEK)[number]) => void;
  onDeleteSlot: (slot: ResolvedSlot["slot"]) => void;
  onAddException: (slot: ResolvedSlot["slot"]) => void;
  onDeleteException: (exception: OfferingException) => void;
};

const dayColumn =
  "flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.02]";

/** Compact summary of one exception, rendered under its parent slot. */
function ExceptionChip({
  exception,
  onDelete,
}: {
  exception: OfferingException;
  onDelete: () => void;
}) {
  const date = toDateKey(exception.date);

  const label =
    exception.exception_type === "cancelled"
      ? "Cancelled"
      : exception.exception_type === "rescheduled"
      ? `Moved to ${toDisplayTime(exception.new_start_time ?? "")}–${toDisplayTime(
          exception.new_end_time ?? "",
        )}${exception.new_room ? ` · ${exception.new_room}` : ""}`
      : "Extra class";

  const tone =
    exception.exception_type === "cancelled"
      ? "text-error-600 dark:text-error-400"
      : "text-warning-700 dark:text-warning-400";

  return (
    <li className="flex items-start justify-between gap-2 rounded-md bg-white px-2 py-1.5 dark:bg-gray-900">
      <span className={`text-xs ${tone}`}>
        <span className="font-medium">{date}</span> · {label}
      </span>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Remove ${exception.exception_type} on ${date}`}
        className="shrink-0 text-xs text-gray-400 transition hover:text-error-500"
      >
        ✕
      </button>
    </li>
  );
}

function SlotCard({
  resolved,
  onDeleteSlot,
  onAddException,
  onDeleteException,
}: {
  resolved: ResolvedSlot;
  onDeleteSlot: () => void;
  onAddException: () => void;
  onDeleteException: (exception: OfferingException) => void;
}) {
  const { slot, exceptions, cancellations } = resolved;

  // A slot with any cancellation is struck through. It still recurs on every
  // other week, so this signals "has cancelled dates", not "deleted".
  const hasCancellation = cancellations.length > 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p
            className={`text-sm font-semibold text-gray-800 dark:text-white/90 ${
              hasCancellation ? "line-through decoration-error-500/70" : ""
            }`}
          >
            {toDisplayTime(slot.start_time)} – {toDisplayTime(slot.end_time)}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {slot.room || "No room set"}
          </p>
        </div>

        <button
          type="button"
          onClick={onDeleteSlot}
          aria-label={`Delete ${slot.day_of_week} ${toDisplayTime(slot.start_time)} slot`}
          className="shrink-0 rounded-md border border-error-300 px-2 py-1 text-xs font-medium text-error-600 transition hover:bg-error-50 dark:border-error-800 dark:text-error-400 dark:hover:bg-error-500/10"
        >
          Delete
        </button>
      </div>

      {exceptions.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-gray-100 pt-2 dark:border-gray-800">
          {exceptions.map((exception) => (
            <ExceptionChip
              key={exception.id}
              exception={exception}
              onDelete={() => onDeleteException(exception)}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onAddException}
        className="mt-3 w-full rounded-md border border-dashed border-gray-300 py-1.5 text-xs font-medium text-gray-600 transition hover:border-brand-400 hover:text-brand-500 dark:border-gray-700 dark:text-gray-400"
      >
        + Cancel or reschedule
      </button>
    </div>
  );
}

/**
 * The weekly timetable for one offering.
 *
 * Seven day columns rather than an hour-by-hour matrix: slot counts are low,
 * and a time-axis grid wastes most of its space while making overlaps harder to
 * read, not easier. Wide content scrolls inside its own container so the page
 * body never scrolls sideways.
 */
export default function WeeklyGrid({
  view,
  loading = false,
  error = null,
  onAddSlot,
  onDeleteSlot,
  onAddException,
  onDeleteException,
}: WeeklyGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-7" aria-hidden="true">
        {DAYS_OF_WEEK.map((day) => (
          <div key={day} className={dayColumn}>
            <div className="h-4 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-20 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <div className="grid min-w-[900px] grid-cols-7 gap-3">
          {DAYS_OF_WEEK.map((day) => {
            const slots = view.days[day];

            return (
              <div key={day} className={dayColumn}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    {day.slice(0, 3)}
                  </h3>
                  <span className="text-xs text-gray-400">{slots.length}</span>
                </div>

                {slots.map((resolved) => (
                  <SlotCard
                    key={resolved.slot.id}
                    resolved={resolved}
                    onDeleteSlot={() => onDeleteSlot(resolved.slot)}
                    onAddException={() => onAddException(resolved.slot)}
                    onDeleteException={onDeleteException}
                  />
                ))}

                <button
                  type="button"
                  onClick={() => onAddSlot(day)}
                  className="rounded-lg border border-dashed border-gray-300 py-2 text-xs font-medium text-gray-500 transition hover:border-brand-400 hover:text-brand-500 dark:border-gray-700 dark:text-gray-400"
                >
                  + Add slot
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {view.extras.length > 0 && (
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">
            Extra classes
          </h3>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            One-off sessions with no recurring slot behind them.
          </p>
          <ul className="space-y-1.5">
            {view.extras.map((exception) => (
              <li
                key={exception.id}
                className="flex items-center justify-between gap-3 rounded-md bg-gray-50 px-3 py-2 dark:bg-white/[0.03]"
              >
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">{toDateKey(exception.date)}</span>
                  {exception.new_start_time && (
                    <>
                      {" · "}
                      {toDisplayTime(exception.new_start_time)}
                      {exception.new_end_time
                        ? `–${toDisplayTime(exception.new_end_time)}`
                        : ""}
                    </>
                  )}
                  {exception.new_room ? ` · ${exception.new_room}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteException(exception)}
                  className="text-xs text-gray-400 transition hover:text-error-500"
                  aria-label={`Remove extra class on ${toDateKey(exception.date)}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.orphaned.length > 0 && (
        <div className="rounded-xl border border-warning-300 bg-warning-50 p-4 dark:border-warning-700 dark:bg-warning-500/10">
          <h3 className="mb-2 text-sm font-semibold text-warning-700 dark:text-warning-400">
            Unlinked exceptions
          </h3>
          <p className="mb-3 text-xs text-warning-700 dark:text-warning-400">
            These reference a slot that no longer appears in this timetable. They
            are shown so they can be cleaned up rather than lingering invisibly.
          </p>
          <ul className="space-y-1.5">
            {view.orphaned.map((exception) => (
              <li key={exception.id} className="flex items-center justify-between gap-3">
                <span className="text-sm text-warning-700 dark:text-warning-400">
                  {toDateKey(exception.date)} · {exception.exception_type}
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteException(exception)}
                  className="text-xs text-warning-700 underline transition hover:text-error-500 dark:text-warning-400"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-error-500" />
          <span className="line-through decoration-error-500/70">Struck through</span> = has
          a cancelled date
        </span>
        <span className="flex items-center gap-1.5">
          <Badge size="sm" color="light">
            Extra
          </Badge>
          = one-off session
        </span>
      </div>
    </div>
  );
}
