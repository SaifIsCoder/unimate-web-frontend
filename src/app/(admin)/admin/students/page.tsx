"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
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
import { listStudents, listStudentsBySemester } from "@/services/directoryService";
import type { SemesterStudent, Student } from "@/types/academics";

type Mode = "all" | "semester";

export default function StudentDirectoryPage() {
  const [mode, setMode] = useState<Mode>("all");

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [semester, setSemester] = useState("");
  const [semesterRows, setSemesterRows] = useState<SemesterStudent[]>([]);
  const [semesterLoading, setSemesterLoading] = useState(false);
  const [semesterError, setSemesterError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Async closure so no setState runs synchronously in the effect body, with
  // `alive` guarding against a response landing after unmount.
  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const rows = await listStudents();
        if (alive) {
          setStudents(rows);
          setListError(null);
        }
      } catch (error) {
        if (alive) setListError(errorMessage(error, "Could not load students."));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /**
   * Client-side filter. `GET /students` is unpaginated and returns the whole
   * cohort, so there is nothing to gain from a server round trip per keystroke —
   * revisit if the roster grows past a few thousand.
   */
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return students;

    return students.filter((student) =>
      [student.roll_number, student.email, student.department_name, String(student.batch)]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle)),
    );
  }, [students, query]);

  const loadSemester = async () => {
    const value = semester.trim();
    if (!value) {
      setFeedback({
        variant: "error",
        title: "Semester required",
        message: "Enter a semester exactly as it appears on the offering, e.g. “Fall 2026”.",
      });
      return;
    }

    setFeedback(null);
    setSemesterLoading(true);
    try {
      setSemesterRows(await listStudentsBySemester(value));
      setSemesterError(null);
    } catch (error) {
      setSemesterRows([]);
      setSemesterError(errorMessage(error, "Could not load that semester."));
    } finally {
      setSemesterLoading(false);
    }
  };

  const nameCell = (row: { id: string; roll_number: string; email: string }) => (
    <Link
      href={`/admin/students/${row.id}`}
      className="font-medium text-brand-500 hover:text-brand-600 hover:underline"
    >
      {row.roll_number}
    </Link>
  );

  const allColumns: Column<Student>[] = [
    { key: "roll", header: "Roll number", render: nameCell },
    { key: "email", header: "Email", render: (row) => row.email },
    { key: "batch", header: "Batch", render: (row) => row.batch ?? "—" },
    {
      key: "department",
      header: "Department",
      render: (row) =>
        row.department_name || <span className="text-gray-400 dark:text-gray-500">Unassigned</span>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (row) => (
        <Link
          href={`/admin/students/${row.id}`}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
        >
          View
        </Link>
      ),
    },
  ];

  const semesterColumns: Column<SemesterStudent>[] = [
    { key: "roll", header: "Roll number", render: nameCell },
    { key: "email", header: "Email", render: (row) => row.email },
    {
      key: "department",
      header: "Department",
      render: (row) => row.department_name ?? "—",
    },
    {
      key: "courses",
      header: "Enrolled courses",
      render: (row) => (
        <div className="flex flex-wrap gap-1.5">
          {row.enrollments.map((enrollment) => (
            <Badge key={enrollment.offering_id} size="sm" color="light">
              {enrollment.course_code} · {enrollment.section}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "count",
      header: "Load",
      render: (row) => `${row.enrollments.length} course(s)`,
    },
  ];

  return (
    <div>
      <PageBreadcrumb pageTitle="Student Directory" />

      <div className="space-y-6">
        <FeedbackBanner feedback={feedback} />

        {/* Mode switch — the two endpoints return different shapes, so they get
            different tables rather than one table with conditional columns. */}
        <div className="flex gap-2">
          {(
            [
              ["all", "All students"],
              ["semester", "By semester"],
            ] as [Mode, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                mode === value
                  ? "bg-brand-500 text-white"
                  : "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "all" ? (
          <ComponentCard
            title="All students"
            desc={
              loading
                ? "Loading…"
                : `${filtered.length} of ${students.length} student(s)`
            }
          >
            <FormRow label="Search" htmlFor="student_search" hint="Roll number, email, department or batch.">
              <Input
                id="student_search"
                placeholder="FA21-BCS"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </FormRow>

            <DataTable
              columns={allColumns}
              rows={filtered}
              rowKey={(row) => row.id}
              loading={loading}
              error={listError}
              emptyMessage={
                query ? "No students match that search." : "No students yet."
              }
            />
          </ComponentCard>
        ) : (
          <ComponentCard
            title="Students by semester"
            desc="Only students with an active enrolment in that semester appear — anyone who dropped every course is excluded."
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <FormRow
                  label="Semester"
                  htmlFor="semester"
                  required
                  hint="Matched exactly against the offering's semester value."
                >
                  <Input
                    id="semester"
                    placeholder="Fall 2026"
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                  />
                </FormRow>
              </div>
              <div className="pb-1">
                <Button onClick={loadSemester} disabled={semesterLoading}>
                  {semesterLoading ? "Loading…" : "Load roster"}
                </Button>
              </div>
            </div>

            <DataTable
              columns={semesterColumns}
              rows={semesterRows}
              rowKey={(row) => row.id}
              loading={semesterLoading}
              error={semesterError}
              emptyMessage="Enter a semester above to load its roster."
            />
          </ComponentCard>
        )}
      </div>
    </div>
  );
}
