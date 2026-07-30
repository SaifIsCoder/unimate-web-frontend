"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Badge from "@/components/ui/badge/Badge";
import FeedbackBanner, {
  errorMessage,
  type Feedback,
} from "@/components/admin/FeedbackBanner";
import DataTable, { type Column } from "@/components/admin/DataTable";
import DetailField from "@/components/admin/DetailField";
import { getStudent, getStudentEnrollments } from "@/services/directoryService";
import type { StudentDetail, StudentEnrollment } from "@/types/academics";

export default function StudentDetailPage() {
  const params = useParams<{ studentId: string }>();
  const studentId = params?.studentId;

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(true);
  const [enrollmentsError, setEnrollmentsError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // The async closure keeps every setState off the synchronous effect path, and
  // `alive` prevents a late response writing to an unmounted page — likely here,
  // since users click through the directory quickly.
  useEffect(() => {
    if (!studentId) return;

    let alive = true;

    void (async () => {
      // Fetched independently: a failure to load enrolments should not blank out
      // the profile, and vice versa.
      const [profileResult, enrollmentsResult] = await Promise.allSettled([
        getStudent(studentId),
        getStudentEnrollments(studentId),
      ]);

      if (!alive) return;

      if (profileResult.status === "fulfilled") {
        setStudent(profileResult.value);
        setFeedback(null);
      } else {
        setStudent(null);
        setFeedback({
          variant: "error",
          title: "Could not load this student",
          message: errorMessage(profileResult.reason, "The student may no longer exist."),
        });
      }

      if (enrollmentsResult.status === "fulfilled") {
        setEnrollments(enrollmentsResult.value);
        setEnrollmentsError(null);
      } else {
        setEnrollments([]);
        setEnrollmentsError(
          errorMessage(enrollmentsResult.reason, "Could not load enrolments."),
        );
      }

      setLoading(false);
      setEnrollmentsLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [studentId]);

  const columns: Column<StudentEnrollment>[] = [
    {
      key: "course",
      header: "Course",
      render: (row) => (
        <div>
          <div className="font-medium text-gray-800 dark:text-white/90">
            {row.course_code}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{row.course_title}</div>
        </div>
      ),
    },
    { key: "semester", header: "Semester", render: (row) => row.semester },
    { key: "section", header: "Section", render: (row) => row.section },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge size="sm" color={row.status === "enrolled" ? "success" : "light"}>
          {row.status}
        </Badge>
      ),
    },
  ];

  const activeCount = enrollments.filter((row) => row.status === "enrolled").length;

  return (
    <div>
      <PageBreadcrumb pageTitle={student?.roll_number ?? "Student"} />

      <div className="space-y-6">
        <Link
          href="/admin/students"
          className="inline-flex items-center gap-1 text-sm text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          ← Back to directory
        </Link>

        <FeedbackBanner feedback={feedback} />

        <ComponentCard
          title="Student profile"
          desc="Read-only. Student records are maintained through user provisioning."
        >
          {loading ? (
            <div className="space-y-3" aria-hidden="true">
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800"
                />
              ))}
            </div>
          ) : student ? (
            <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <DetailField label="Roll number" value={student.roll_number} />
              <DetailField label="Email" value={student.email} />
              <DetailField label="Batch" value={student.batch ? String(student.batch) : null} />
              <DetailField
                label="Department"
                value={
                  student.department_name
                    ? `${student.department_name}${
                        student.department_code ? ` (${student.department_code})` : ""
                      }`
                    : null
                }
              />
              <DetailField label="Phone" value={student.phone} />
              <DetailField label="Address" value={student.address} />
              <DetailField label="Guardian" value={student.father_name} />
              <DetailField label="Guardian phone" value={student.guardian_phone} />
              <DetailField label="Emergency phone" value={student.emergency_phone} />
              <DetailField
                label="Target CGPA"
                value={student.target_cgpa ? Number(student.target_cgpa).toFixed(2) : null}
              />
              <DetailField label="Study intensity" value={student.study_intensity} />
            </dl>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No profile to display.
            </p>
          )}
        </ComponentCard>

        <ComponentCard
          title="Enrolments"
          desc={
            enrollmentsLoading
              ? "Loading…"
              : `${enrollments.length} total · ${activeCount} active`
          }
        >
          <DataTable
            columns={columns}
            rows={enrollments}
            rowKey={(row) => row.id}
            loading={enrollmentsLoading}
            error={enrollmentsError}
            emptyMessage="This student has no enrolments."
          />
        </ComponentCard>
      </div>
    </div>
  );
}
