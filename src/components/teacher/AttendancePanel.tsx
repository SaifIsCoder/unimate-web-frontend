"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import FormRow from "@/components/admin/FormRow";
import FeedbackBanner, {
  errorMessage,
  type Feedback,
} from "@/components/admin/FeedbackBanner";
import DataTable, { type Column } from "@/components/admin/DataTable";
import {
  getAttendanceStats,
  getSessionRecords,
  listSessions,
  recordAttendance,
} from "@/services/teachingService";
import type {
  AttendanceStat,
  AttendanceStatus,
  AttendanceSession,
  Enrollment,
} from "@/types/academics";

const STATUSES: AttendanceStatus[] = ["present", "absent", "late", "leave"];

const STATUS_COLOR: Record<AttendanceStatus, "success" | "error" | "warning" | "info"> = {
  present: "success",
  absent: "error",
  late: "warning",
  leave: "info",
};

const todayIso = () => new Date().toISOString().slice(0, 10);

type AttendancePanelProps = {
  offeringId: string;
  roster: Enrollment[];
  rosterLoading: boolean;
};

export default function AttendancePanel({
  offeringId,
  roster,
  rosterLoading,
}: AttendancePanelProps) {
  const [date, setDate] = useState(todayIso);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [stats, setStats] = useState<AttendanceStat[]>([]);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  /** Id of the session whose existing marks have been merged in, if any. */
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Only actively enrolled students may be submitted; the server rejects others.
  const activeRoster = useMemo(
    () => roster.filter((row) => row.status === "enrolled"),
    [roster],
  );

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await listSessions(offeringId));
    } catch {
      setSessions([]);
    }
  }, [offeringId]);

  const refreshStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const page = await getAttendanceStats(offeringId);
      setStats(page.data);
      setStatsError(null);
    } catch (error) {
      setStatsError(errorMessage(error, "Could not load attendance stats."));
    } finally {
      setLoadingStats(false);
    }
  }, [offeringId]);

  // Async closure keeps setState off the synchronous effect path; `alive`
  // guards against a response landing after the teacher switches class.
  useEffect(() => {
    let alive = true;

    void (async () => {
      const [sessionResult, statsResult] = await Promise.allSettled([
        listSessions(offeringId),
        getAttendanceStats(offeringId),
      ]);

      if (!alive) return;

      setSessions(sessionResult.status === "fulfilled" ? sessionResult.value : []);

      if (statsResult.status === "fulfilled") {
        setStats(statsResult.value.data);
        setStatsError(null);
      } else {
        setStatsError(errorMessage(statsResult.reason, "Could not load attendance stats."));
      }

      setLoadingStats(false);
    })();

    return () => {
      alive = false;
    };
  }, [offeringId]);

  /**
   * `marks` deliberately holds only the teacher's *overrides*.
   *
   * Everyone defaults to present — the same default the server applies — and
   * every read does `marks[id] ?? "present"`. Seeding the whole roster into
   * state from an effect (as this previously did) was both a cascading render
   * and redundant: the fallback already covers students the map has never seen,
   * including any who arrive after the first render.
   */

  const sessionForDate = useMemo(
    () => sessions.find((session) => session.date?.slice(0, 10) === date) ?? null,
    [sessions, date],
  );

  /**
   * Load an existing session's marks so re-submitting doesn't wipe earlier work.
   *
   * `prefilling` is derived from which session has been resolved rather than
   * set at the top of the effect, which would be a cascading render. As with
   * the timetable page, comparing "requested" against "settled" gives the same
   * answer with one less render and cannot desynchronise.
   */
  useEffect(() => {
    if (!sessionForDate || activeRoster.length === 0) return;

    let cancelled = false;
    const sessionId = sessionForDate.id;

    void (async () => {
      try {
        const records = await getSessionRecords(sessionId);
        if (cancelled) return;

        // Records key off enrollment_id; map back to student_id via the roster.
        const byEnrollment = new Map(
          activeRoster.map((row) => [String(row.id), row.student_id]),
        );
        setMarks((previous) => {
          const next = { ...previous };
          for (const record of records) {
            const studentId = byEnrollment.get(String(record.enrollment_id));
            if (studentId) next[studentId] = record.status;
          }
          return next;
        });
      } catch {
        // A session with no records yet is normal — keep the present defaults.
      } finally {
        if (!cancelled) setPrefilledFor(sessionId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionForDate, activeRoster]);

  const setAll = (status: AttendanceStatus) => {
    setMarks(Object.fromEntries(activeRoster.map((row) => [row.student_id, status])));
  };

  const tally = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      present: 0,
      absent: 0,
      late: 0,
      leave: 0,
    };
    for (const row of activeRoster) {
      counts[marks[row.student_id] ?? "present"] += 1;
    }
    return counts;
  }, [activeRoster, marks]);

  const handleSubmit = async () => {
    setFeedback(null);

    if (!date) {
      setFeedback({
        variant: "error",
        title: "Pick a date",
        message: "A date is required — the API pairs offering_id with a date.",
      });
      return;
    }
    if (activeRoster.length === 0) {
      setFeedback({
        variant: "error",
        title: "Nobody to mark",
        message: "This class has no actively enrolled students.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const result = await recordAttendance({
        offering_id: offeringId,
        date: new Date(`${date}T00:00:00`).toISOString(),
        records: activeRoster.map((row) => ({
          student_id: row.student_id,
          status: marks[row.student_id] ?? "present",
        })),
      });
      setFeedback({
        variant: "success",
        title: "Attendance saved",
        message: `${result.records.length} record(s) saved for ${date}. Re-submitting the same date updates the existing session.`,
      });
      await refreshSessions();
      await refreshStats();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not save attendance",
        message: errorMessage(error, "The server rejected the request."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const statColumns: Column<AttendanceStat>[] = [
    { key: "roll", header: "Roll number", render: (row) => row.roll_number },
    { key: "present", header: "Present", render: (row) => row.present },
    { key: "absent", header: "Absent", render: (row) => row.absent },
    { key: "late", header: "Late", render: (row) => row.late },
    { key: "leaves", header: "Leave", render: (row) => row.leaves },
    {
      key: "pct",
      header: "Attendance",
      render: (row) => `${row.attendance_percentage}%`,
    },
    {
      key: "eligible",
      header: "Exam eligible",
      render: (row) => (
        <Badge size="sm" color={row.eligible_for_exam ? "success" : "error"}>
          {row.eligible_for_exam ? "Yes" : "No"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <ComponentCard
        title="Take attendance"
        desc="Everyone defaults to present — mark only the exceptions, then save."
      >
        <FeedbackBanner feedback={feedback} />

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <FormRow
            label="Date"
            htmlFor="attendance-date"
            required
            hint={
              sessionForDate
                ? "A session already exists for this date — saving updates it."
                : "A new session is created for this date."
            }
          >
            <Input
              id="attendance-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </FormRow>

          <div className="flex flex-wrap items-end gap-2">
            {STATUSES.map((status) => (
              <Button
                key={status}
                size="sm"
                variant="outline"
                disabled={activeRoster.length === 0}
                onClick={() => setAll(status)}
              >
                All {status}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUSES.map((status) => (
            <Badge key={status} size="sm" color={STATUS_COLOR[status]}>
              {status}: {tally[status]}
            </Badge>
          ))}
        </div>

        {sessionForDate && prefilledFor !== sessionForDate.id && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Loading previously saved marks for this date…
          </p>
        )}

        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          {rosterLoading ? (
            <p className="p-5 text-sm text-gray-500 dark:text-gray-400">Loading roster…</p>
          ) : activeRoster.length === 0 ? (
            <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
              No actively enrolled students to mark.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {activeRoster.map((row) => {
                const current = marks[row.student_id] ?? "present";
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                        {row.roll_number}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {row.student_email}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {STATUSES.map((status) => {
                        const selected = current === status;
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() =>
                              setMarks((previous) => ({
                                ...previous,
                                [row.student_id]: status,
                              }))
                            }
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition ${
                              selected
                                ? "border-brand-500 bg-brand-500 text-white"
                                : "border-gray-300 text-gray-600 hover:border-brand-300 dark:border-gray-700 dark:text-gray-400"
                            }`}
                          >
                            {status}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting || activeRoster.length === 0}>
            {submitting ? "Saving…" : "Save attendance"}
          </Button>
        </div>
      </ComponentCard>

      <ComponentCard
        title="Attendance summary"
        desc={`${sessions.length} session(s) recorded for this class. Leaves are excluded from the percentage.`}
      >
        <DataTable
          columns={statColumns}
          rows={stats}
          rowKey={(row) => row.student_id}
          loading={loadingStats}
          error={statsError}
          emptyMessage="No attendance has been recorded yet."
        />
      </ComponentCard>
    </div>
  );
}
