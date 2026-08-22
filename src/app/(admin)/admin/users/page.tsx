"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import FormRow from "@/components/admin/FormRow";
import FeedbackBanner, {
  errorMessage,
  type Feedback,
} from "@/components/admin/FeedbackBanner";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { useAuth } from "@/context/AuthContext";
import { listDepartments } from "@/services/academicService";
import {
  assignableRoles,
  createUser,
  emptyCreateUserForm,
  listUsers,
  type CreateUserForm,
  type UserRow,
} from "@/services/userService";
import type { Department, Role, PageMeta } from "@/types/academics";

const ROLE_LABELS: Record<Role, string> = {
  student: "Student",
  teacher: "Teacher",
  admin: "Admin",
  super_admin: "Super Admin",
};

const roleBadgeColor = (role: Role) => {
  if (role === "super_admin") return "error" as const;
  if (role === "admin") return "warning" as const;
  if (role === "teacher") return "info" as const;
  return "success" as const;
};

export default function UserProvisioningPage() {
  const { user } = useAuth();
  const [form, setForm] = useState<CreateUserForm>(emptyCreateUserForm);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [meta, setMeta] = useState<PageMeta | undefined>();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof CreateUserForm, string>>>({});

  const roles = useMemo(() => assignableRoles(user?.role), [user?.role]);

  const refreshUsers = useCallback(async () => {
    setLoadingList(true);
    try {
      const response = await listUsers(page, limit);
      setUsers(response.data);
      setMeta(response.meta);
      setListError(null);
    } catch (error) {
      setListError(errorMessage(error, "Could not load accounts."));
    } finally {
      setLoadingList(false);
    }
  }, [page, limit]);

  // Async closure keeps setState off the synchronous effect path; `alive`
  // guards against a response landing after unmount.
  useEffect(() => {
    let alive = true;

    void (async () => {
      // Departments only feed a picker — an empty list is a survivable
      // degradation, a missing user table is not.
      const [departmentResult, userResult] = await Promise.allSettled([
        listDepartments(),
        listUsers(page, limit),
      ]);

      if (!alive) return;

      setDepartments(departmentResult.status === "fulfilled" ? departmentResult.value.data : []);

      if (userResult.status === "fulfilled") {
        setUsers(userResult.value.data);
        setMeta(userResult.value.meta);
        setListError(null);
      } else {
        setListError(errorMessage(userResult.reason, "Could not load accounts."));
      }

      setLoadingList(false);
    })();

    return () => {
      alive = false;
    };
  }, [page, limit]);

  const setField = <K extends keyof CreateUserForm>(key: K, value: CreateUserForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof CreateUserForm, string>> = {};

    if (!form.email.trim()) next.email = "Email is required.";
    else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = "Enter a valid email.";

    if (form.password.length < 8) next.password = "Password must be at least 8 characters.";
    if (form.department_id === "") next.department_id = "Department is required.";

    if (form.role === "student" && !form.roll_number.trim()) {
      next.roll_number = "Roll number is required for students.";
    }
    if (form.role === "student" && form.batch) {
      const batch = Number(form.batch);
      if (!Number.isInteger(batch) || batch < 2000 || batch > 2100) {
        next.batch = "Batch must be a year between 2000 and 2100.";
      }
    }
    if (form.role === "teacher" && !form.employee_id.trim()) {
      next.employee_id = "Employee ID is required for teachers.";
    }
    if ((form.role === "admin" || form.role === "super_admin") && !form.admin_id.trim()) {
      next.admin_id = "Admin ID is required for admin accounts.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    setFeedback(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const created = await createUser(form);
      setFeedback({
        variant: "success",
        title: "Account created",
        message: `${ROLE_LABELS[form.role]} account for ${created.email} was created along with its profile record.`,
      });
      setForm({ ...emptyCreateUserForm(), role: form.role, department_id: form.department_id });
      void refreshUsers();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not create account",
        message: errorMessage(error, "The server rejected the request."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<UserRow>[] = [
    { key: "email", header: "Email", render: (row) => row.email },
    {
      key: "role",
      header: "Role",
      render: (row) => (
        <Badge size="sm" color={roleBadgeColor(row.role)}>
          {ROLE_LABELS[row.role] ?? row.role}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge size="sm" color={row.is_active ? "success" : "light"}>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  return (
    <div>
      <PageBreadcrumb pageTitle="User Provisioning" />

      <div className="space-y-6">
        <ComponentCard
          title="Create account"
          desc="POST /users creates the login and its role profile (student, teacher, or admin) in a single transaction. There are no separate endpoints for creating those profiles."
        >
          <FeedbackBanner feedback={feedback} />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormRow label="Role" htmlFor="role" required>
              <Select
                id="role"
                value={form.role}
                options={roles.map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
                onChange={(value) => setField("role", value as Role)}
              />
            </FormRow>

            <FormRow
              label="Department"
              htmlFor="department_id"
              required
              error={errors.department_id}
              hint={departments.length === 0 ? "No departments found — create one first." : undefined}
            >
              <Select
                id="department_id"
                value={form.department_id === "" ? "" : String(form.department_id)}
                placeholder="Select a department"
                options={departments.map((department) => ({
                  value: String(department.id),
                  label: `${department.code} — ${department.name}`,
                }))}
                onChange={(value) => setField("department_id", value === "" ? "" : Number(value))}
              />
            </FormRow>

            <FormRow label="Email" htmlFor="email" required error={errors.email}>
              <Input
                id="email"
                type="email"
                placeholder="name@university.edu"
                value={form.email}
                error={Boolean(errors.email)}
                onChange={(e) => setField("email", e.target.value)}
              />
            </FormRow>

            <FormRow
              label="Temporary password"
              htmlFor="password"
              required
              error={errors.password}
              hint="Minimum 8 characters. The account holder is prompted to change it on first login."
            >
              <Input
                id="password"
                type="password"
                value={form.password}
                error={Boolean(errors.password)}
                onChange={(e) => setField("password", e.target.value)}
              />
            </FormRow>

            {form.role === "student" && (
              <>
                <FormRow label="Roll number" htmlFor="roll_number" required error={errors.roll_number}>
                  <Input
                    id="roll_number"
                    placeholder="CS-2025-001"
                    value={form.roll_number}
                    error={Boolean(errors.roll_number)}
                    onChange={(e) => setField("roll_number", e.target.value)}
                  />
                </FormRow>
                <FormRow label="Batch" htmlFor="batch" error={errors.batch} hint="Optional intake year.">
                  <Input
                    id="batch"
                    type="number"
                    placeholder="2025"
                    value={form.batch}
                    error={Boolean(errors.batch)}
                    onChange={(e) => setField("batch", e.target.value)}
                  />
                </FormRow>
              </>
            )}

            {form.role === "teacher" && (
              <FormRow label="Employee ID" htmlFor="employee_id" required error={errors.employee_id}>
                <Input
                  id="employee_id"
                  placeholder="T-001"
                  value={form.employee_id}
                  error={Boolean(errors.employee_id)}
                  onChange={(e) => setField("employee_id", e.target.value)}
                />
              </FormRow>
            )}

            {(form.role === "admin" || form.role === "super_admin") && (
              <FormRow label="Admin ID" htmlFor="admin_id" required error={errors.admin_id}>
                <Input
                  id="admin_id"
                  placeholder="A-001"
                  value={form.admin_id}
                  error={Boolean(errors.admin_id)}
                  onChange={(e) => setField("admin_id", e.target.value)}
                />
              </FormRow>
            )}
          </div>

          {user?.role !== "super_admin" && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Only a super admin can create admin or super admin accounts, so those roles are hidden here.
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Creating…" : "Create account"}
            </Button>
          </div>
        </ComponentCard>

        <ComponentCard title="Existing accounts" desc={`${users.length} account(s)`}>
          <DataTable
            columns={columns}
            rows={users}
            rowKey={(row) => row.id}
            loading={loadingList}
            error={listError}
            emptyMessage="No accounts yet."
            pagination={meta}
            onPageChange={setPage}
          />
        </ComponentCard>
      </div>
    </div>
  );
}
