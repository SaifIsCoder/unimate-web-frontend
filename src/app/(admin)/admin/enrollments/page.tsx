"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Select from "@/components/form/Select";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import FormRow from "@/components/admin/FormRow";
import FeedbackBanner, {
  errorMessage,
  type Feedback,
} from "@/components/admin/FeedbackBanner";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { listOfferings, listStudents } from "@/services/academicService";
import {
  enrollStudent,
  listEnrollmentsByOffering,
  removeEnrollment,
  updateEnrollment,
} from "@/services/enrollmentService";
import type { Enrollment, Offering, Student, PageMeta } from "@/types/academics";

export default function EnrollmentsPage() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [offeringId, setOfferingId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [roster, setRoster] = useState<Enrollment[]>([]);
  const [meta, setMeta] = useState<PageMeta | undefined>();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    listOfferings(1, 100)
      .then((page) => setOfferings(page.data))
      .catch(() => setOfferings([]));
    listStudents(1, 100)
      .then((page) => setStudents(page.data))
      .catch(() => setStudents([]));
  }, []);

  const selectedOffering = useMemo(
    () => offerings.find((offering) => offering.id === offeringId) ?? null,
    [offerings, offeringId],
  );

  const loadRoster = useCallback(async (id: string) => {
    if (!id) {
      setRoster([]);
      setTotal(0);
      setMeta(undefined);
      return;
    }

    setLoadingRoster(true);
    try {
      const response = await listEnrollmentsByOffering(id, { page, limit });
      setRoster(response.data);
      setMeta(response.meta);
      setTotal(response.meta.total);
      setRosterError(null);
    } catch (error) {
      setRoster([]);
      setRosterError(errorMessage(error, "Could not load the roster."));
    } finally {
      setLoadingRoster(false);
    }
  }, [page, limit]);

  // Async closure keeps setState off the synchronous effect path; `alive`
  // guards against a stale roster overwriting a newer one when the admin
  // switches offering quickly.
  useEffect(() => {
    if (!offeringId) return;

    let alive = true;

    void (async () => {
      setLoadingRoster(true);
      try {
        const response = await listEnrollmentsByOffering(offeringId, { page, limit });
        if (!alive) return;
        setRoster(response.data);
        setMeta(response.meta);
        setTotal(response.meta.total);
        setRosterError(null);
      } catch (error) {
        if (alive) {
          setRoster([]);
          setRosterError(errorMessage(error, "Could not load the roster."));
        }
      } finally {
        if (alive) setLoadingRoster(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [offeringId, page, limit]);

  const activeCount = useMemo(
    () => roster.filter((row) => row.status === "enrolled").length,
    [roster],
  );

  const seatsLeft = selectedOffering ? selectedOffering.capacity - activeCount : null;

  // Students already on the roster can't be added twice — the server returns a
  // 409, so filter them out of the picker instead.
  const enrollableStudents = useMemo(() => {
    const taken = new Set(roster.map((row) => row.student_id));
    return students.filter((student) => !taken.has(student.id));
  }, [roster, students]);

  const handleEnroll = async () => {
    if (!offeringId || !studentId) return;
    setFeedback(null);
    setSubmitting(true);

    try {
      await enrollStudent({ student_id: studentId, offering_id: offeringId });
      const student = students.find((entry) => entry.id === studentId);
      setFeedback({
        variant: "success",
        title: "Student enrolled",
        message: `${student?.roll_number ?? "Student"} was added to ${
          selectedOffering?.course_code ?? "the offering"
        }.`,
      });
      setStudentId("");
      await loadRoster(offeringId);
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not enroll student",
        message: errorMessage(error, "The server rejected the request."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (row: Enrollment) => {
    const nextStatus = row.status === "enrolled" ? "dropped" : "enrolled";
    setFeedback(null);
    setBusyId(row.id);

    try {
      await updateEnrollment(row.id, { status: nextStatus });
      setFeedback({
        variant: "success",
        title: "Enrollment updated",
        message: `${row.roll_number} is now ${nextStatus}.`,
      });
      await loadRoster(offeringId);
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not update enrollment",
        message: errorMessage(error, "The server rejected the request."),
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (row: Enrollment) => {
    setFeedback(null);
    setBusyId(row.id);

    try {
      await removeEnrollment(row.id);
      setFeedback({
        variant: "success",
        title: "Enrollment removed",
        message: `${row.roll_number} was removed from the roster.`,
      });
      await loadRoster(offeringId);
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not remove enrollment",
        message: errorMessage(error, "The server rejected the request."),
      });
    } finally {
      setBusyId(null);
    }
  };

  const columns: Column<Enrollment>[] = [
    { key: "roll", header: "Roll number", render: (row) => row.roll_number },
    { key: "email", header: "Email", render: (row) => row.student_email },
    {
      key: "department",
      header: "Department",
      render: (row) => row.department_name ?? "—",
    },
    { key: "batch", header: "Batch", render: (row) => row.batch ?? "—" },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge size="sm" color={row.status === "enrolled" ? "success" : "light"}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busyId === row.id}
            onClick={() => handleStatusChange(row)}
          >
            {row.status === "enrolled" ? "Drop" : "Re-enroll"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busyId === row.id}
            onClick={() => handleRemove(row)}
          >
            Remove
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageBreadcrumb pageTitle="Enrollments" />

      <div className="space-y-6">
        <ComponentCard
          title="Assign students to an offering"
          desc="Pick an offering to see its roster, then add students to it. Enrollment writes are admin-only; teachers can read the roster for offerings they own."
        >
          <FeedbackBanner feedback={feedback} />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormRow
              label="Offering"
              htmlFor="offering"
              required
              hint={
                selectedOffering
                  ? `Capacity ${selectedOffering.capacity} · ${activeCount} enrolled · ${seatsLeft} seat(s) left`
                  : "Rosters load once an offering is selected."
              }
            >
              <Select
                id="offering"
                value={offeringId}
                placeholder="Select an offering"
                options={offerings.map((offering) => ({
                  value: offering.id,
                  label: `${offering.course_code} — ${offering.semester} · Section ${offering.section}`,
                }))}
                onChange={(value) => {
                  setOfferingId(value);
                  setStudentId("");
                  setPage(1);
                  setFeedback(null);
                }}
              />
            </FormRow>

            <FormRow
              label="Student"
              htmlFor="student"
              required
              hint={
                offeringId && enrollableStudents.length === 0
                  ? "Every student is already on this roster."
                  : "Students already enrolled are hidden."
              }
            >
              <Select
                id="student"
                value={studentId}
                disabled={!offeringId}
                placeholder={offeringId ? "Select a student" : "Select an offering first"}
                options={enrollableStudents.map((student) => ({
                  value: student.id,
                  label: `${student.roll_number} — ${student.email}`,
                }))}
                onChange={setStudentId}
              />
            </FormRow>
          </div>

          {seatsLeft !== null && seatsLeft <= 0 && (
            <p className="text-xs text-warning-500">
              This offering is at capacity. The server will reject further enrollments with a 409.
            </p>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handleEnroll}
              disabled={!offeringId || !studentId || submitting}
            >
              {submitting ? "Enrolling…" : "Enroll student"}
            </Button>
          </div>
        </ComponentCard>

        <ComponentCard
          title="Roster"
          desc={
            selectedOffering
              ? `${selectedOffering.course_code} · ${selectedOffering.semester} · Section ${selectedOffering.section} — ${total} record(s)`
              : "No offering selected"
          }
        >
          <DataTable
            columns={columns}
            rows={roster}
            rowKey={(row) => row.id}
            loading={loadingRoster}
            error={rosterError}
            emptyMessage={
              offeringId ? "No students enrolled yet." : "Select an offering to view its roster."
            }
            pagination={meta}
            onPageChange={setPage}
          />
        </ComponentCard>
      </div>
    </div>
  );
}
