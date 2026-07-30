"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Select from "@/components/form/Select";
import FormRow from "@/components/admin/FormRow";
import { Modal } from "@/components/ui/modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import FeedbackBanner, {
  errorMessage,
  type Feedback,
} from "@/components/admin/FeedbackBanner";
import WeeklyGrid from "@/components/admin/timetable/WeeklyGrid";
import SlotForm from "@/components/admin/timetable/SlotForm";
import ExceptionForm from "@/components/admin/timetable/ExceptionForm";
import { listOfferings } from "@/services/academicService";
import {
  createException,
  createSlot,
  deleteException,
  deleteSlot,
  listExceptions,
  listSlots,
  type CreateExceptionPayload,
  type CreateSlotPayload,
} from "@/services/scheduleService";
import { buildWeekView, toDateKey, type IndexedSlot } from "@/lib/timetable";
import type {
  DayOfWeek,
  OfferingException,
  Offering,
  ScheduleSlot,
} from "@/types/academics";

const offeringLabel = (offering: Offering) =>
  `${offering.course_code} · ${offering.section} · ${offering.semester}`;

/**
 * Builds the cross-offering slot index used for advisory clash detection.
 *
 * There is no bulk schedules endpoint, so this costs one request per offering.
 * With the API's 100-requests-per-15-minutes limit that is a real budget, so:
 *   - it is only built when the user first opens the add-slot form, never on
 *     page load;
 *   - it is cached for the rest of the session;
 *   - requests run at a small fixed concurrency rather than all at once;
 *   - failures are swallowed per offering, because the whole feature is
 *     advisory — a partial index still catches most clashes, and none of it
 *     should ever block scheduling.
 */
const buildCrossOfferingIndex = async (
  offerings: Offering[],
  concurrency = 4,
): Promise<IndexedSlot[]> => {
  const index: IndexedSlot[] = [];
  const queue = [...offerings];

  const worker = async () => {
    for (;;) {
      const offering = queue.shift();
      if (!offering) return;

      try {
        const slots = await listSlots(offering.id);
        for (const slot of slots) {
          index.push({
            ...slot,
            offering_label: offeringLabel(offering),
            teacher_id: offering.teacher_id,
            teacher_email: offering.teacher_email,
          });
        }
      } catch {
        // Advisory only — a missing offering just narrows the check.
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, offerings.length) }, worker));
  return index;
};

export default function MasterTimetablePage() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [offeringId, setOfferingId] = useState("");
  const [offeringsError, setOfferingsError] = useState<string | null>(null);

  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [exceptions, setExceptions] = useState<OfferingException[]>([]);
  const [timetableError, setTimetableError] = useState<string | null>(null);
  /**
   * Which offering the loaded slots/exceptions belong to.
   *
   * Loading is *derived* from this rather than held as its own flag: switching
   * offering would otherwise need a synchronous `setLoading(true)` inside the
   * effect, which triggers a cascading render. Comparing the requested id
   * against the loaded one gives the same answer with one less render, and
   * cannot desynchronise.
   */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const timetableLoading = Boolean(offeringId) && (loadedFor !== offeringId || refreshing);

  // Slot dialog
  const [slotFormOpen, setSlotFormOpen] = useState(false);
  const [slotFormDay, setSlotFormDay] = useState<DayOfWeek>("Monday");
  const [slotSubmitting, setSlotSubmitting] = useState(false);
  const [slotServerError, setSlotServerError] = useState<string | null>(null);

  // Exception dialog
  const [exceptionSlot, setExceptionSlot] = useState<ScheduleSlot | null>(null);
  const [exceptionFormOpen, setExceptionFormOpen] = useState(false);
  const [exceptionSubmitting, setExceptionSubmitting] = useState(false);
  const [exceptionServerError, setExceptionServerError] = useState<string | null>(null);

  // Deletions
  const [pendingSlotDelete, setPendingSlotDelete] = useState<ScheduleSlot | null>(null);
  const [pendingExceptionDelete, setPendingExceptionDelete] =
    useState<OfferingException | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [crossIndex, setCrossIndex] = useState<IndexedSlot[]>([]);
  const [indexBuilt, setIndexBuilt] = useState(false);
  const [indexBuilding, setIndexBuilding] = useState(false);

  const [feedback, setFeedback] = useState<Feedback>(null);

  const selected = useMemo(
    () => offerings.find((offering) => offering.id === offeringId) ?? null,
    [offerings, offeringId],
  );

  // Offerings list. Async closure keeps setState off the synchronous effect path.
  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const rows = await listOfferings();
        if (!alive) return;
        setOfferings(rows);
        setOfferingsError(null);
        if (rows.length > 0) setOfferingId((current) => current || rows[0].id);
      } catch (error) {
        if (alive) setOfferingsError(errorMessage(error, "Could not load offerings."));
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /** Re-fetch after a mutation. Runs from a handler, so sync setState is fine. */
  const reloadTimetable = useCallback((id: string) => {
    if (!id) return;
    setRefreshing(true);

    void Promise.all([listSlots(id), listExceptions(id)])
      .then(([nextSlots, nextExceptions]) => {
        setSlots(nextSlots);
        setExceptions(nextExceptions);
        setTimetableError(null);
      })
      .catch((error) =>
        setTimetableError(errorMessage(error, "Could not load this timetable.")),
      )
      .finally(() => setRefreshing(false));
  }, []);

  // Timetable for the selected offering. `loadedFor` doubles as the loading
  // signal, so nothing is set synchronously here.
  useEffect(() => {
    if (!offeringId) return;

    let alive = true;

    void (async () => {
      try {
        const [nextSlots, nextExceptions] = await Promise.all([
          listSlots(offeringId),
          listExceptions(offeringId),
        ]);
        if (!alive) return;
        setSlots(nextSlots);
        setExceptions(nextExceptions);
        setTimetableError(null);
      } catch (error) {
        if (alive) {
          setSlots([]);
          setExceptions([]);
          setTimetableError(errorMessage(error, "Could not load this timetable."));
        }
      } finally {
        // Marks this offering as resolved whether it succeeded or failed —
        // otherwise a failure would spin forever.
        if (alive) setLoadedFor(offeringId);
      }
    })();

    return () => {
      alive = false;
    };
  }, [offeringId]);

  const view = useMemo(() => buildWeekView(slots, exceptions), [slots, exceptions]);

  const openSlotForm = async (day: DayOfWeek) => {
    setSlotFormDay(day);
    setSlotServerError(null);
    setSlotFormOpen(true);

    // Build the advisory index on first use, so the request budget is only
    // spent by admins who actually schedule something.
    if (!indexBuilt && offerings.length > 0) {
      setIndexBuilding(true);
      const index = await buildCrossOfferingIndex(offerings);
      setCrossIndex(index);
      setIndexBuilt(true);
      setIndexBuilding(false);
    }
  };

  const handleCreateSlot = async (payload: CreateSlotPayload) => {
    setSlotSubmitting(true);
    setSlotServerError(null);

    try {
      await createSlot(payload);
      setFeedback({
        variant: "success",
        title: "Slot added",
        message: `${payload.day_of_week} ${payload.start_time}–${payload.end_time} was added.`,
      });
      setSlotFormOpen(false);
      reloadTimetable(offeringId);
      // The new slot invalidates the cached index.
      setIndexBuilt(false);
    } catch (error) {
      // 409 is the server's same-offering overlap guard; surface it inline in
      // the form rather than as a page-level banner.
      setSlotServerError(errorMessage(error, "Could not add this slot."));
    } finally {
      setSlotSubmitting(false);
    }
  };

  const handleCreateException = async (payload: CreateExceptionPayload) => {
    setExceptionSubmitting(true);
    setExceptionServerError(null);

    try {
      await createException(payload);
      setFeedback({
        variant: "success",
        title: "Exception saved",
        message: `${payload.exception_type} recorded for ${payload.date}.`,
      });
      setExceptionFormOpen(false);
      reloadTimetable(offeringId);
    } catch (error) {
      setExceptionServerError(errorMessage(error, "Could not save this exception."));
    } finally {
      setExceptionSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);

    try {
      if (pendingSlotDelete) {
        await deleteSlot(pendingSlotDelete.id);
        setFeedback({
          variant: "success",
          title: "Slot deleted",
          message: "The recurring slot and its exceptions were removed.",
        });
        setIndexBuilt(false);
      } else if (pendingExceptionDelete) {
        await deleteException(pendingExceptionDelete.id);
        setFeedback({
          variant: "success",
          title: "Exception removed",
          message: `The ${pendingExceptionDelete.exception_type} entry was deleted.`,
        });
      }
      reloadTimetable(offeringId);
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not delete",
        message: errorMessage(error, "The server rejected the request."),
      });
    } finally {
      setDeleting(false);
      setPendingSlotDelete(null);
      setPendingExceptionDelete(null);
    }
  };

  return (
    <div>
      <PageBreadcrumb pageTitle="Master Timetable" />

      <div className="space-y-6">
        <FeedbackBanner feedback={feedback} />

        <ComponentCard
          title="Offering"
          desc="Timetables are managed per offering. Pick one to view or edit its week."
        >
          <FormRow label="Course offering" htmlFor="offering" required error={offeringsError ?? undefined}>
            <Select
              id="offering"
              value={offeringId}
              placeholder={offerings.length ? "Select an offering" : "No offerings available"}
              options={offerings.map((offering) => ({
                value: offering.id,
                label: `${offeringLabel(offering)}${
                  offering.teacher_email ? ` — ${offering.teacher_email}` : " — unassigned"
                }`,
              }))}
              onChange={setOfferingId}
            />
          </FormRow>
        </ComponentCard>

        {offeringId && (
          <ComponentCard
            title={selected ? offeringLabel(selected) : "Weekly timetable"}
            desc={
              timetableLoading
                ? "Loading…"
                : `${slots.length} recurring slot(s) · ${exceptions.length} exception(s)`
            }
          >
            <WeeklyGrid
              view={view}
              loading={timetableLoading}
              error={timetableError}
              onAddSlot={(day) => void openSlotForm(day)}
              onDeleteSlot={setPendingSlotDelete}
              onAddException={(slot) => {
                setExceptionSlot(slot);
                setExceptionServerError(null);
                setExceptionFormOpen(true);
              }}
              onDeleteException={setPendingExceptionDelete}
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setExceptionSlot(null);
                  setExceptionServerError(null);
                  setExceptionFormOpen(true);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              >
                + Add extra class
              </button>
            </div>
          </ComponentCard>
        )}
      </div>

      <Modal
        isOpen={slotFormOpen}
        onClose={() => setSlotFormOpen(false)}
        className="m-4 max-w-2xl p-6 lg:p-8"
      >
        <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
          Add a weekly slot
        </h2>
        {indexBuilding && (
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Checking other offerings for clashes…
          </p>
        )}
        {selected && (
          <SlotForm
            offeringId={selected.id}
            offeringLabel={offeringLabel(selected)}
            teacherId={selected.teacher_id}
            teacherEmail={selected.teacher_email}
            existingSlots={slots}
            crossOfferingIndex={crossIndex}
            indexUnavailable={indexBuilt && crossIndex.length === 0 && offerings.length > 1}
            defaultDay={slotFormDay}
            submitting={slotSubmitting}
            serverError={slotServerError}
            onSubmit={handleCreateSlot}
            onCancel={() => setSlotFormOpen(false)}
          />
        )}
      </Modal>

      <Modal
        isOpen={exceptionFormOpen}
        onClose={() => setExceptionFormOpen(false)}
        className="m-4 max-w-2xl p-6 lg:p-8"
      >
        <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
          {exceptionSlot ? "Cancel or reschedule" : "Add an extra class"}
        </h2>
        <ExceptionForm
          offeringId={offeringId}
          slot={exceptionSlot}
          existing={
            exceptionSlot
              ? exceptions.filter((e) => e.schedule_id === exceptionSlot.id)
              : exceptions.filter((e) => e.exception_type === "extra")
          }
          submitting={exceptionSubmitting}
          serverError={exceptionServerError}
          onSubmit={handleCreateException}
          onCancel={() => setExceptionFormOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        open={pendingSlotDelete !== null || pendingExceptionDelete !== null}
        destructive
        busy={deleting}
        title={pendingSlotDelete ? "Delete this weekly slot?" : "Remove this exception?"}
        confirmLabel={pendingSlotDelete ? "Delete slot" : "Remove exception"}
        message={
          pendingSlotDelete ? (
            <>
              <p>
                The{" "}
                <strong className="text-gray-800 dark:text-white/90">
                  {pendingSlotDelete.day_of_week}
                </strong>{" "}
                slot will be permanently removed.
              </p>
              <p className="mt-2">
                Any cancellations or reschedules attached to it are deleted too,
                and the change is immediately visible in the student mobile app.
              </p>
            </>
          ) : (
            <p>
              The <strong>{pendingExceptionDelete?.exception_type}</strong> entry for{" "}
              {pendingExceptionDelete ? toDateKey(pendingExceptionDelete.date) : ""} will be
              removed, and the class reverts to its normal schedule.
            </p>
          )
        }
        onConfirm={handleDelete}
        onCancel={() => {
          setPendingSlotDelete(null);
          setPendingExceptionDelete(null);
        }}
      />
    </div>
  );
}
