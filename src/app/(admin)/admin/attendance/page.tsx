"use client";

import React, { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Select from "@/components/form/Select";
import Badge from "@/components/ui/badge/Badge";
import FormRow from "@/components/admin/FormRow";
import FeedbackBanner, {
  errorMessage,
  type Feedback,
} from "@/components/admin/FeedbackBanner";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { listOfferings } from "@/services/academicService";
import { getAttendanceStats, getSessionRecords, listSessions } from "@/services/attendanceService";
import { ATTENDANCE_THRESHOLD } from "@/lib/gradebook";
import type {
  AttendanceRecord,
  AttendanceSession,
  AttendanceStat,
  Offering,
  PageMeta,
} from "@/types/academics";

const offeringLabel = (offering: Offering) =>
  `${offering.course_code} · ${offering.section} · ${offering.semester}`;

export default function AttendanceReportPage() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [offeringId, setOfferingId] = useState("");
  const [offeringsError, setOfferingsError] = useState<string | null>(null);

  const [stats, setStats] = useState<AttendanceStat[]>([]);
  const [meta, setMeta] = useState<PageMeta | undefined>();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState("");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [recordsLoadedFor, setRecordsLoadedFor] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const loading = Boolean(offeringId) && loadedFor !== offeringId;

  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const page = await listOfferings();
        if (!alive) return;
        setOfferings(page.data);
        setOfferingsError(null);
        if (page.data.length > 0) setOfferingId((current) => current || page.data[0].id);
      } catch (error) {
        if (alive) setOfferingsError(errorMessage(error, "Could not load offerings."));
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!offeringId) return;

    let alive = true;

    void (async () => {
      const [statsResult, sessionResult] = await Promise.allSettled([
        getAttendanceStats(offeringId, { page, limit }),
        listSessions(offeringId),
      ]);

      if (!alive) return;

      if (statsResult.status === "fulfilled") {
        // @ts-expect-error - The backend returns { totalLectures, studentStats: { data, meta } }
        setStats(statsResult.value.studentStats.data);
        // @ts-expect-error
        setMeta(statsResult.value.studentStats.meta);
        setStatsError(null);
      } else {
        setStats([]);
        setStatsError(errorMessage(statsResult.reason, "Could not load attendance."));
      }

      setSessions(sessionResult.status === "fulfilled" ? sessionResult.value : []);
      setLoadedFor(offeringId);
    })();

    return () => {
      alive = false;
    };
  }, [offeringId, page, limit]);

  useEffect(() => {
    if (!sessionId) return;

    let alive = true;

    void (async () => {
      try {
        const rows = await getSessionRecords(sessionId);
        if (!alive) return;
        setRecords(rows);
        setFeedback(null);
      } catch (error) {
        if (alive) {
          setRecords([]);
          setFeedback({
            variant: "error",
            title: "Could not load that session",
            message: errorMessage(error, "The session may no longer exist."),
          });
        }
      } finally {
        if (alive) setRecordsLoadedFor(sessionId);
      }
    })();

    return () => {
      alive = false;
    };
  }, [sessionId]);

  const atRisk = useMemo(() => stats.filter((row) => !row.eligible_for_exam), [stats]);

  const columns: Column<AttendanceStat>[] = [
    { key: "roll", header: "Roll number", render: (row) => row.roll_number },
    {
      key: "attended",
      header: "Present",
      render: (row) => `${row.present} / ${row.adjusted_total}`,
    },
    { key: "absent", header: "Absent", render: (row) => row.absent },
    { key: "late", header: "Late", render: (row) => row.late },
    {
      key: "leaves",
      header: "Leaves",
      render: (row) => (
        <span title="Approved leaves are excluded from the denominator">{row.leaves}</span>
      ),
    },
    {
      key: "pct",
      header: "Attendance",
      render: (row) => {
        const pct = Number(row.attendance_percentage);
        return (
          <span
            className={`font-medium ${
              row.eligible_for_exam
                ? "text-gray-800 dark:text-white/90"
                : "text-error-600 dark:text-error-400"
            }`}
          >
            {pct.toFixed(1)}%
          </span>
        );
      },
    },
    {
      key: "eligible",
      header: "Exam eligible",
      render: (row) => (
        <Badge size="sm" color={row.eligible_for_exam ? "success" : "error"}>
          {row.eligible_for_exam ? "Eligible" : "Not eligible"}
        </Badge>
      ),
    },
  ];

  const recordColumns: Column<AttendanceRecord>[] = [
    { key: "roll", header: "Roll number", render: (row) => row.roll_number },
    { key: "email", header: "Email", render: (row) => row.email },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge
          size="sm"
          color={
            row.status === "present"
              ? "success"
              : row.status === "absent"
              ? "error"
              : row.status === "late"
              ? "warning"
              : "light"
          }
        >
          {row.status}
        </Badge>
      ),
    },
  ];

  return (
    <div>
      <PageBreadcrumb pageTitle="Attendance Report" />

      <div className="space-y-6">
        <FeedbackBanner feedback={feedback} />

        <ComponentCard title="Offering" desc="Attendance is reported per offering.">
          <FormRow
            label="Course offering"
            htmlFor="att_offering"
            required
            error={offeringsError ?? undefined}
          >
            <Select
              id="att_offering"
              value={offeringId}
              placeholder={offerings.length ? "Select an offering" : "No offerings available"}
              options={offerings.map((offering) => ({
                value: offering.id,
                label: offeringLabel(offering),
              }))}
              onChange={(value) => {
                // Cleared here rather than in the effect: this runs from an
                // event handler, where synchronous setState is fine, and it
                // stops the previous offering's session detail lingering.
                setSessionId("");
                setRecords([]);
                setPage(1);
                setOfferingId(value);
              }}
            />
          </FormRow>
        </ComponentCard>

        {offeringId && (
          <>
            {/* Eligibility is the reason this screen exists, so it leads. */}
            {!loading && stats.length > 0 && (
              <div
                className={`rounded-xl border-2 p-4 ${
                  atRisk.length > 0
                    ? "border-error-400 bg-error-50 dark:border-error-700 dark:bg-error-500/10"
                    : "border-success-300 bg-success-50 dark:border-success-800 dark:bg-success-500/10"
                }`}
              >
                <p
                  className={`text-sm font-semibold ${
                    atRisk.length > 0
                      ? "text-error-700 dark:text-error-400"
                      : "text-success-700 dark:text-success-400"
                  }`}
                >
                  {atRisk.length === 0
                    ? `All ${stats.length} students are eligible to sit the final exam.`
                    : `${atRisk.length} of ${stats.length} students are NOT eligible to sit the final exam.`}
                </p>
                {atRisk.length > 0 && (
                  <p className="mt-1.5 text-sm text-error-700 dark:text-error-400">
                    {atRisk.map((row) => row.roll_number).join(", ")}
                  </p>
                )}
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                  Eligibility requires {ATTENDANCE_THRESHOLD}% attendance and is
                  decided by the server, which excludes approved leaves from the
                  denominator — the percentage shown is out of{" "}
                  <em>adjusted</em> lectures, not total ones.
                </p>
              </div>
            )}

            <ComponentCard
              title="Per-student attendance"
              desc={loading ? "Loading…" : `${stats.length} student(s)`}
            >
              <DataTable
                columns={columns}
                rows={stats}
                rowKey={(row) => row.student_id}
                loading={loading}
                error={statsError}
                emptyMessage="No attendance recorded for this offering yet."
                pagination={meta}
                onPageChange={setPage}
              />
            </ComponentCard>

            <ComponentCard
              title="Session detail"
              desc="Inspect who was marked what on a specific date."
            >
              <FormRow label="Session" htmlFor="att_session">
                <Select
                  id="att_session"
                  value={sessionId}
                  placeholder={
                    sessions.length ? "Select a session" : "No sessions recorded yet"
                  }
                  options={sessions.map((session) => ({
                    value: session.id,
                    label: session.date?.slice(0, 10) ?? session.id,
                  }))}
                  onChange={setSessionId}
                />
              </FormRow>

              {sessionId && (
                <DataTable
                  columns={recordColumns}
                  rows={records}
                  rowKey={(row) => row.id}
                  loading={recordsLoadedFor !== sessionId}
                  emptyMessage="No records for this session — everyone was left at the default of present."
                />
              )}
            </ComponentCard>
          </>
        )}
      </div>
    </div>
  );
}
