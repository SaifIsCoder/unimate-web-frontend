"use client";

import React, { useCallback, useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import FormRow from "@/components/admin/FormRow";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import FeedbackBanner, {
  errorMessage,
  type Feedback,
} from "@/components/admin/FeedbackBanner";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { useAuth } from "@/context/AuthContext";
import { deleteAdmin, listAdmins, updateAdmin } from "@/services/directoryService";
import type { AdminRecord, PageMeta } from "@/types/academics";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Administrator",
};

export default function AdministratorsPage() {
  const { user } = useAuth();

  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [meta, setMeta] = useState<PageMeta | undefined>();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [editing, setEditing] = useState<AdminRecord | null>(null);
  const [adminId, setAdminId] = useState("");
  const [adminIdError, setAdminIdError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<AdminRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  /** Re-fetch after a mutation; runs from an event handler, so sync setState is fine. */
  const refresh = useCallback(() => {
    setLoading(true);
    void listAdmins(page, limit)
      .then((response) => {
        setAdmins(response.data);
        setMeta(response.meta);
        setListError(null);
      })
      .catch((error) => setListError(errorMessage(error, "Could not load administrators.")))
      .finally(() => setLoading(false));
  }, [page, limit]);

  // Async closure so no setState runs synchronously in the effect body, with
  // `alive` guarding against a response landing after unmount.
  useEffect(() => {
    let alive = true;

    void (async () => {
      setLoading(true);
      try {
        const response = await listAdmins(page, limit);
        if (alive) {
          setAdmins(response.data);
          setMeta(response.meta);
          setListError(null);
        }
      } catch (error) {
        if (alive) setListError(errorMessage(error, "Could not load administrators."));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [page, limit]);

  const startEdit = (admin: AdminRecord) => {
    setEditing(admin);
    setAdminId(admin.admin_id ?? "");
    setAdminIdError(undefined);
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!editing) return;

    const value = adminId.trim();
    if (!value) {
      setAdminIdError("Admin ID is required.");
      return;
    }
    if (value === editing.admin_id) {
      setEditing(null);
      return;
    }

    setSaving(true);
    try {
      await updateAdmin(editing.id, { admin_id: value });
      setFeedback({
        variant: "success",
        title: "Administrator updated",
        message: `Admin ID changed to ${value}.`,
      });
      setEditing(null);
      void refresh();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not update this administrator",
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
      await deleteAdmin(pendingDelete.id);
      setFeedback({
        variant: "success",
        title: "Administrator profile removed",
        message: `${pendingDelete.email} no longer has an admin profile.`,
      });
      setPendingDelete(null);
      void refresh();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not remove this administrator",
        message: errorMessage(error, "The server rejected the request."),
      });
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  /** Removing your own admin profile would lock you out of this very screen. */
  const isSelf = (admin: AdminRecord) => admin.user_id === user?.id;

  const columns: Column<AdminRecord>[] = [
    {
      key: "admin_id",
      header: "Admin ID",
      render: (row) => (
        <span className="font-medium text-gray-800 dark:text-white/90">
          {row.admin_id || <span className="text-gray-400 dark:text-gray-500">Not set</span>}
        </span>
      ),
    },
    {
      key: "email",
      header: "Email",
      render: (row) => (
        <span className="flex items-center gap-2">
          {row.email}
          {isSelf(row) && (
            <Badge size="sm" color="info">
              You
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (row) => (
        <Badge size="sm" color={row.role === "super_admin" ? "primary" : "light"}>
          {ROLE_LABEL[row.role] ?? row.role}
        </Badge>
      ),
    },
    {
      key: "department",
      header: "Department",
      render: (row) =>
        row.department_name || (
          <span className="text-gray-400 dark:text-gray-500">Unassigned</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge size="sm" color={row.is_active ? "success" : "error"}>
          {row.is_active ? "Active" : "Deactivated"}
        </Badge>
      ),
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
            disabled={isSelf(row)}
            title={isSelf(row) ? "You cannot remove your own admin profile" : undefined}
            className="rounded-lg border border-error-300 px-3 py-1.5 text-xs font-medium text-error-600 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:border-error-800 dark:text-error-400 dark:hover:bg-error-500/10"
          >
            Remove
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageBreadcrumb pageTitle="Administrators" />

      <div className="space-y-6">
        <div
          role="note"
          className="flex gap-3 rounded-xl border border-warning-300 bg-warning-50 px-4 py-3 dark:border-warning-700 dark:bg-warning-500/10"
        >
          <p className="text-sm text-warning-700 dark:text-warning-400">
            <strong>Super admin only.</strong> Changes here affect who can
            administer UniMate. New administrator accounts are created through
            User Provisioning — this screen manages existing ones.
          </p>
        </div>

        <FeedbackBanner feedback={feedback} />

        {editing && (
          <ComponentCard title={`Edit ${editing.email}`} desc={ROLE_LABEL[editing.role] ?? editing.role}>
            <FormRow label="Admin ID" htmlFor="admin_id" required error={adminIdError}>
              <Input
                id="admin_id"
                value={adminId}
                placeholder="A101"
                error={Boolean(adminIdError)}
                onChange={(e) => {
                  setAdminId(e.target.value);
                  setAdminIdError(undefined);
                }}
              />
            </FormRow>

            {/*
              Same constraint as the faculty roster: `updateAdminSchema` accepts
              a `department` string, but `admins` only has `department_id`, so
              sending it raises a SQL error. Tracked as BE-8.
            */}
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
              Department cannot be reassigned here — the API has no working
              endpoint for it yet. This matters: admins may only post
              announcements to their own department.
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
          title="Administrators"
          desc={loading ? "Loading…" : `${admins.length} administrator(s)`}
        >
          <DataTable
            columns={columns}
            rows={admins}
            rowKey={(row) => row.id}
            loading={loading}
            error={listError}
            emptyMessage="No administrator profiles found."
            pagination={meta}
            onPageChange={setPage}
          />
        </ComponentCard>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        destructive
        busy={deleting}
        title="Remove this administrator profile?"
        confirmLabel="Remove profile"
        message={
          <>
            <p>
              <strong className="text-gray-800 dark:text-white/90">
                {pendingDelete?.email}
              </strong>{" "}
              will lose their administrator profile permanently.
            </p>
            <p className="mt-2">
              Their user account is <em>not</em> deleted and keeps its role, so
              they may retain access until the account itself is deactivated in
              User Provisioning.
            </p>
          </>
        }
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
