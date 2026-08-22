"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import FeedbackBanner, {
  errorMessage,
  type Feedback,
} from "@/components/admin/FeedbackBanner";
import DataTable, { type Column } from "@/components/admin/DataTable";
import DetailField from "@/components/admin/DetailField";
import { listDepartments } from "@/services/academicService";
import { getTeacher, getTeacherOfferings } from "@/services/directoryService";
import type { Department, TeacherDetail, TeacherOffering } from "@/types/academics";

export default function TeacherDetailPage() {
  const params = useParams<{ teacherId: string }>();
  const teacherId = params?.teacherId;

  const [teacher, setTeacher] = useState<TeacherDetail | null>(null);
  const [offerings, setOfferings] = useState<TeacherOffering[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [offeringsLoading, setOfferingsLoading] = useState(true);
  const [offeringsError, setOfferingsError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Async closure keeps setState off the synchronous effect path; `alive` stops
  // a late response writing to an unmounted page.
  useEffect(() => {
    if (!teacherId) return;

    let alive = true;

    void (async () => {
      const [profileResult, offeringsResult, departmentsResult] = await Promise.allSettled([
        getTeacher(teacherId),
        getTeacherOfferings(teacherId),
        listDepartments(),
      ]);

      if (!alive) return;

      if (profileResult.status === "fulfilled") {
        setTeacher(profileResult.value);
        setFeedback(null);
      } else {
        setTeacher(null);
        setFeedback({
          variant: "error",
          title: "Could not load this faculty member",
          message: errorMessage(profileResult.reason, "The profile may no longer exist."),
        });
      }

      if (offeringsResult.status === "fulfilled") {
        setOfferings(offeringsResult.value);
        setOfferingsError(null);
      } else {
        setOfferings([]);
        setOfferingsError(errorMessage(offeringsResult.reason, "Could not load offerings."));
      }

      // Only used to name the department — absence degrades to showing the id.
      setDepartments(departmentsResult.status === "fulfilled" ? departmentsResult.value.data : []);

      setLoading(false);
      setOfferingsLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [teacherId]);

  /**
   * `GET /teachers/:id` joins only the user row, so unlike the list endpoint it
   * returns no `department_name`. Resolve it client-side from the departments
   * list rather than showing a bare integer.
   */
  const departmentLabel = (): string | null => {
    if (teacher?.department_id == null) return null;
    const match = departments.find((department) => department.id === teacher.department_id);
    return match ? `${match.name} (${match.code})` : `Department #${teacher.department_id}`;
  };

  const columns: Column<TeacherOffering>[] = [
    {
      key: "course",
      header: "Course",
      render: (row) => (
        <div>
          <div className="font-medium text-gray-800 dark:text-white/90">{row.course_code}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{row.course_title}</div>
        </div>
      ),
    },
    { key: "semester", header: "Semester", render: (row) => row.semester },
    { key: "section", header: "Section", render: (row) => row.section },
    { key: "capacity", header: "Capacity", render: (row) => row.capacity },
  ];

  return (
    <div>
      <PageBreadcrumb pageTitle={teacher?.employee_id ?? "Faculty member"} />

      <div className="space-y-6">
        <Link
          href="/admin/faculty"
          className="inline-flex items-center gap-1 text-sm text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          ← Back to roster
        </Link>

        <FeedbackBanner feedback={feedback} />

        <ComponentCard title="Faculty profile">
          {loading ? (
            <div className="space-y-3" aria-hidden="true">
              {[0, 1].map((row) => (
                <div
                  key={row}
                  className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800"
                />
              ))}
            </div>
          ) : teacher ? (
            <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <DetailField label="Employee ID" value={teacher.employee_id} />
              <DetailField label="Email" value={teacher.email} />
              <DetailField
                label="Department"
                value={departmentLabel()}
                emptyText="Unassigned"
              />
            </dl>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No profile to display.</p>
          )}
        </ComponentCard>

        <ComponentCard
          title="Course offerings"
          desc={
            offeringsLoading
              ? "Loading…"
              : `Teaching ${offerings.length} offering(s)`
          }
        >
          <DataTable
            columns={columns}
            rows={offerings}
            rowKey={(row) => row.id}
            loading={offeringsLoading}
            error={offeringsError}
            emptyMessage="Not assigned to any offerings. Assign one from the Offerings screen."
          />
        </ComponentCard>
      </div>
    </div>
  );
}
