"use client";

import React, { useCallback, useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Button from "@/components/ui/button/Button";
import FormRow from "@/components/admin/FormRow";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import FeedbackBanner, {
  errorMessage,
  type Feedback,
} from "@/components/admin/FeedbackBanner";
import DataTable, { type Column } from "@/components/admin/DataTable";
import {
  createDepartment,
  deleteDepartment,
  listDepartments as fetchDepartments,
  updateDepartment,
} from "@/services/academicService";
import type { Department, PageMeta } from "@/types/academics";

type DepartmentForm = {
  name: string;
  code: string;
  description: string;
};

const emptyForm = (): DepartmentForm => ({ name: "", code: "", description: "" });

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [meta, setMeta] = useState<PageMeta | undefined>();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [form, setForm] = useState<DepartmentForm>(emptyForm);
  /** null = creating; a number = editing that department (ids are integers). */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Department | null>(null);

  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof DepartmentForm, string>>>({});

  /**
   * Re-fetch after a mutation. Safe to call setState synchronously here because
   * it runs from an event handler, not an effect.
   */
  const reload = useCallback(() => {
    setLoading(true);
    void fetchDepartments(page, limit)
      .then((response) => {
        setDepartments(response.data);
        setMeta(response.meta);
        setListError(null);
      })
      .catch((error) => setListError(errorMessage(error, "Could not load departments.")))
      .finally(() => setLoading(false));
  }, [page, limit]);

  // Initial load. The work happens inside an async closure so no setState runs
  // synchronously in the effect body, and `alive` stops a slow response from
  // writing state after the page has unmounted.
  useEffect(() => {
    let alive = true;

    void (async () => {
      setLoading(true);
      try {
        const response = await fetchDepartments(page, limit);
        if (alive) {
          setDepartments(response.data);
          setMeta(response.meta);
          setListError(null);
        }
      } catch (error) {
        if (alive) setListError(errorMessage(error, "Could not load departments."));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [page, limit]);

  const setField = <K extends keyof DepartmentForm>(key: K, value: DepartmentForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
    setErrors({});
  };

  /** Mirrors the API's Joi schema so the user sees the failure before a round trip. */
  const validate = (): boolean => {
    const next: Partial<Record<keyof DepartmentForm, string>> = {};
    const name = form.name.trim();
    const code = form.code.trim();
    const description = form.description.trim();

    if (name.length < 2 || name.length > 100) next.name = "Name must be 2–100 characters.";
    if (code.length < 2 || code.length > 10) next.code = "Code must be 2–10 characters.";
    if (description.length > 500) next.description = "Description must be 500 characters or fewer.";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    setFeedback(null);
    if (!validate()) return;

    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      // The API rejects an empty string (min 2 on description is absent, but
      // sending "" is noise) — omit the key entirely when blank.
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
    };

    setSubmitting(true);
    try {
      if (editingId === null) {
        const created = await createDepartment(payload);
        setFeedback({
          variant: "success",
          title: "Department created",
          message: `${created.code} — ${created.name} is now available.`,
        });
      } else {
        const updated = await updateDepartment(editingId, payload);
        setFeedback({
          variant: "success",
          title: "Department updated",
          message: `${updated.code} — ${updated.name} was saved.`,
        });
      }
      resetForm();
      reload();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: editingId === null ? "Could not create department" : "Could not update department",
        message: errorMessage(error, "The server rejected the request."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (department: Department) => {
    setEditingId(department.id);
    setForm({
      name: department.name,
      code: department.code,
      description: department.description ?? "",
    });
    setErrors({});
    setFeedback(null);
    // The form sits above the table, so bring it into view on smaller screens.
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;

    setDeleting(true);
    try {
      await deleteDepartment(pendingDelete.id);
      setFeedback({
        variant: "success",
        title: "Department deleted",
        message: `${pendingDelete.code} — ${pendingDelete.name} was removed.`,
      });
      if (editingId === pendingDelete.id) resetForm();
      setPendingDelete(null);
      reload();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not delete department",
        // Courses, students, teachers and admins all reference departments, so
        // this is most often a foreign-key violation rather than a bug.
        message: errorMessage(
          error,
          "It may still be referenced by courses, students, teachers or admins.",
        ),
      });
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<Department>[] = [
    { key: "code", header: "Code", render: (row) => row.code },
    { key: "name", header: "Name", render: (row) => row.name },
    {
      key: "description",
      header: "Description",
      render: (row) =>
        row.description || <span className="text-gray-400 dark:text-gray-500">—</span>,
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (row) => (
        <div className="flex justify-end gap-2">
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
            Delete
          </button>
        </div>
      ),
    },
  ];

  const isEditing = editingId !== null;

  return (
    <div>
      <PageBreadcrumb pageTitle="Departments" />

      <div className="space-y-6">
        <ComponentCard
          title={isEditing ? "Edit department" : "Add a department"}
          desc="Departments scope courses, people, announcements and community moderation."
        >
          <FeedbackBanner feedback={feedback} />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormRow label="Name" htmlFor="dept_name" required error={errors.name}>
              <Input
                id="dept_name"
                placeholder="Computer Science"
                value={form.name}
                error={Boolean(errors.name)}
                onChange={(e) => setField("name", e.target.value)}
              />
            </FormRow>

            <FormRow
              label="Code"
              htmlFor="dept_code"
              required
              error={errors.code}
              hint="Stored uppercase. 2–10 characters."
            >
              <Input
                id="dept_code"
                placeholder="CS"
                value={form.code}
                error={Boolean(errors.code)}
                onChange={(e) => setField("code", e.target.value)}
              />
            </FormRow>
          </div>

          <FormRow
            label="Description"
            htmlFor="dept_description"
            error={errors.description}
            hint="Optional. Up to 500 characters."
          >
            <TextArea
              value={form.description}
              rows={3}
              placeholder="What this department covers."
              error={Boolean(errors.description)}
              onChange={(value) => setField("description", value)}
            />
          </FormRow>

          <div className="flex justify-end gap-3">
            {isEditing && (
              <Button variant="outline" onClick={resetForm} disabled={submitting}>
                Cancel
              </Button>
            )}
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting
                ? isEditing
                  ? "Saving…"
                  : "Creating…"
                : isEditing
                ? "Save changes"
                : "Create department"}
            </Button>
          </div>
        </ComponentCard>

        <ComponentCard title="Departments" desc={`${departments.length} department(s)`}>
          <DataTable
            columns={columns}
            rows={departments}
            rowKey={(row) => String(row.id)}
            loading={loading}
            error={listError}
            emptyMessage="No departments yet. Create one to start building the catalog."
            pagination={meta}
            onPageChange={setPage}
          />
        </ComponentCard>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        destructive
        busy={deleting}
        title="Delete this department?"
        confirmLabel="Delete department"
        message={
          <>
            <p>
              <strong className="text-gray-800 dark:text-white/90">
                {pendingDelete?.code} — {pendingDelete?.name}
              </strong>{" "}
              will be permanently removed.
            </p>
            <p className="mt-2">
              Courses, students, teachers and admins reference departments. If any
              still point at this one, the database will refuse the delete and
              nothing will change.
            </p>
          </>
        }
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
