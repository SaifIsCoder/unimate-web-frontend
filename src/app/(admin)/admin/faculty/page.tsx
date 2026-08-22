"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import FormRow from "@/components/admin/FormRow";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import FeedbackBanner, {
  errorMessage,
  type Feedback,
} from "@/components/admin/FeedbackBanner";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { deleteTeacher, listTeachers, updateTeacher } from "@/services/directoryService";
import type { Teacher, PageMeta } from "@/types/academics";

export default function FacultyRosterPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [meta, setMeta] = useState<PageMeta | undefined>();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [editing, setEditing] = useState<Teacher | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [employeeIdError, setEmployeeIdError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Teacher | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  /** Re-fetch after a mutation; runs from an event handler, so sync setState is fine. */
  const refresh = useCallback(() => {
    setLoading(true);
    void listTeachers(page, limit)
      .then((response) => {
        setTeachers(response.data);
        setMeta(response.meta);
        setListError(null);
      })
      .catch((error) =>
        setListError(errorMessage(error, "Could not load the faculty roster.")),
      )
      .finally(() => setLoading(false));
  }, [page, limit]);

  // Async closure so no setState runs synchronously in the effect body, with
  // `alive` guarding against a response landing after unmount.
  useEffect(() => {
    let alive = true;

    void (async () => {
      setLoading(true);
      try {
        const response = await listTeachers(page, limit);
        if (alive) {
          setTeachers(response.data);
          setMeta(response.meta);
          setListError(null);
        }
      } catch (error) {
        if (alive) setListError(errorMessage(error, "Could not load the faculty roster."));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [page, limit]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return teachers;

    return teachers.filter((teacher) =>
      [teacher.employee_id, teacher.email, teacher.department_name]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle)),
    );
  }, [teachers, query]);

  const startEdit = (teacher: Teacher) => {
    setEditing(teacher);
    setEmployeeId(teacher.employee_id);
    setEmployeeIdError(undefined);
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!editing) return;

    const value = employeeId.trim();
    if (value.length < 2 || value.length > 50) {
      setEmployeeIdError("Employee ID must be 2–50 characters.");
      return;
    }
    if (value === editing.employee_id) {
      // The API rejects an empty patch with 400, and re-sending the same value
      // is a pointless write.
      setEditing(null);
      return;
    }

    setSaving(true);
    try {
      await updateTeacher(editing.id, { employee_id: value });
      setFeedback({
        variant: "success",
        title: "Faculty member updated",
        message: `Employee ID changed to ${value}.`,
      });
      setEditing(null);
      void refresh();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not update this faculty member",
        message: errorMessage(error, "The server rejected the request."),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;

    setDeleting(true);
    try {
      await deleteTeacher(pendingDelete.id);
      setFeedback({
        variant: "success",
        title: "Faculty profile removed",
        message: `${pendingDelete.employee_id} no longer has a teacher profile. Their user account still exists — deactivate it separately if they are leaving.`,
      });
      setPendingDelete(null);
      void refresh();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not remove this faculty member",
        message: errorMessage(
          error,
          "They may still be assigned to course offerings.",
        ),
      });
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<Teacher>[] = [
    {
      key: "employee",
      header: "Employee ID",
      render: (row) => (
        <Link
          href={`/admin/faculty/${row.id}`}
          className="font-medium text-brand-500 hover:text-brand-600 hover:underline"
        >
          {row.employee_id}
        </Link>
      ),
    },
    { key: "email", header: "Email", render: (row) => row.email },
    {
      key: "department",
      header: "Department",
      render: (row) =>
        row.department_name || (
          <span className="text-gray-400 dark:text-gray-500">Unassigned</span>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (row) => (
        <div className="flex justify-end gap-2">
          <Link
            href={`/admin/faculty/${row.id}`}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            View
          </Link>
          <button
            type="button"
            onClick={() => startEdit(row)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setPendingDelete(row)}
            className="rounded-lg border border-error-300 px-3 py-1.5 text-xs font-medium text-error-600 transition hover:bg-error-50 dark:border-error-800 dark:text-error-400 dark:hover:bg-error-500/10"
          >
            Remove
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageBreadcrumb pageTitle="Faculty Roster" />

      <div className="space-y-6">
        <FeedbackBanner feedback={feedback} />

        {editing && (
          <ComponentCard
            title={`Edit ${editing.employee_id}`}
            desc={editing.email}
          >
            <FormRow
              label="Employee ID"
              htmlFor="employee_id"
              required
              error={employeeIdError}
              hint="2–50 characters. Used as the initial password until the teacher sets their own."
            >
              <Input
                id="employee_id"
                value={employeeId}
                error={Boolean(employeeIdError)}
                onChange={(e) => {
                  setEmployeeId(e.target.value);
                  setEmployeeIdError(undefined);
                }}
              />
            </FormRow>

            {/*
              Department is intentionally absent. `updateTeacherBody` accepts a
              free-text `department` string, but the teachers table only has
              `department_id` — the repository builds the UPDATE from payload
              keys verbatim, so sending it raises a SQL error rather than a 400.
              Tracked as BE-8.
            */}
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
              Department cannot be reassigned here — the API has no working
              endpoint for it yet. Recreate the account through User Provisioning
              if a faculty member moves department.
            </p>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </ComponentCard>
        )}

        <ComponentCard
          title="Faculty"
          desc={loading ? "Loading…" : `${filtered.length} of ${teachers.length} teacher(s)`}
        >
          <FormRow label="Search" htmlFor="faculty_search" hint="Employee ID, email or department.">
            <Input
              id="faculty_search"
              placeholder="EMP-10"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </FormRow>

          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(row) => row.id}
            loading={loading}
            error={listError}
            emptyMessage={query ? "No faculty match that search." : "No faculty yet."}
            pagination={meta}
            onPageChange={setPage}
          />
        </ComponentCard>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        destructive
        busy={deleting}
        title="Remove this faculty profile?"
        confirmLabel="Remove profile"
        message={
          <>
            <p>
              <strong className="text-gray-800 dark:text-white/90">
                {pendingDelete?.employee_id}
              </strong>{" "}
              ({pendingDelete?.email}) will lose their teacher profile permanently.
            </p>
            <p className="mt-2">
              Their user account is <em>not</em> deleted — they could still sign in,
              but with no teaching workspace. Deactivate the account in User
              Provisioning as well if they are leaving.
            </p>
          </>
        }
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
