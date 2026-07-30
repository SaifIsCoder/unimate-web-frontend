"use client";

import React, { useCallback, useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import Checkbox from "@/components/form/input/Checkbox";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import FormRow from "@/components/admin/FormRow";
import FeedbackBanner, {
  errorMessage,
  type Feedback,
} from "@/components/admin/FeedbackBanner";
import DataTable, { type Column } from "@/components/admin/DataTable";
import {
  createCourse,
  listCourses,
  listDepartments,
} from "@/services/academicService";
import type { Course, Department } from "@/types/academics";

type CourseForm = {
  code: string;
  title: string;
  credit_hours: string;
  department_id: number | "";
  has_practical: boolean;
};

const emptyForm = (): CourseForm => ({
  code: "",
  title: "",
  credit_hours: "3",
  department_id: "",
  has_practical: false,
});

export default function CoursesPage() {
  const [form, setForm] = useState<CourseForm>(emptyForm);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof CourseForm, string>>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setCourses(await listCourses());
      setListError(null);
    } catch (error) {
      setListError(errorMessage(error, "Could not load courses."));
    } finally {
      setLoading(false);
    }
  }, []);

  // Async closure keeps setState off the synchronous effect path
  // (react-hooks/set-state-in-effect), and `alive` stops a slow response
  // writing to an unmounted page.
  useEffect(() => {
    let alive = true;

    void (async () => {
      // Departments only populate a picker, so a failure degrades to an empty
      // list rather than blocking the course table.
      const [departmentResult, courseResult] = await Promise.allSettled([
        listDepartments(),
        listCourses(),
      ]);

      if (!alive) return;

      setDepartments(departmentResult.status === "fulfilled" ? departmentResult.value : []);

      if (courseResult.status === "fulfilled") {
        setCourses(courseResult.value);
        setListError(null);
      } else {
        setListError(errorMessage(courseResult.reason, "Could not load courses."));
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const setField = <K extends keyof CourseForm>(key: K, value: CourseForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof CourseForm, string>> = {};
    const code = form.code.trim();
    const title = form.title.trim();
    const credits = Number(form.credit_hours);

    if (code.length < 2 || code.length > 30) next.code = "Code must be 2–30 characters.";
    if (title.length < 2 || title.length > 160) next.title = "Title must be 2–160 characters.";
    if (!Number.isInteger(credits) || credits < 0 || credits > 10) {
      next.credit_hours = "Credit hours must be a whole number from 0 to 10.";
    }
    if (form.department_id === "") next.department_id = "Department is required.";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    setFeedback(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const created = await createCourse({
        code: form.code.trim().toUpperCase(),
        title: form.title.trim(),
        credit_hours: Number(form.credit_hours),
        department_id: Number(form.department_id),
        has_practical: form.has_practical,
      });
      setFeedback({
        variant: "success",
        title: "Course created",
        message: `${created.code} — ${created.title} was added to the catalog.`,
      });
      setForm({ ...emptyForm(), department_id: form.department_id });
      void refresh();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not create course",
        message: errorMessage(error, "The server rejected the request."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<Course>[] = [
    { key: "code", header: "Code", render: (row) => row.code },
    { key: "title", header: "Title", render: (row) => row.title },
    { key: "credits", header: "Credits", render: (row) => row.credit_hours },
    {
      key: "department",
      header: "Department",
      render: (row) => row.department_name ?? "—",
    },
    {
      key: "practical",
      header: "Practical",
      render: (row) => (
        <Badge size="sm" color={row.has_practical ? "info" : "light"}>
          {row.has_practical ? "Yes" : "No"}
        </Badge>
      ),
    },
  ];

  return (
    <div>
      <PageBreadcrumb pageTitle="Courses" />

      <div className="space-y-6">
        <ComponentCard
          title="Add a course"
          desc="The course catalog. A course becomes teachable once you create an offering for it."
        >
          <FeedbackBanner feedback={feedback} />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormRow label="Course code" htmlFor="code" required error={errors.code} hint="Stored uppercase.">
              <Input
                id="code"
                placeholder="CS-101"
                value={form.code}
                error={Boolean(errors.code)}
                onChange={(e) => setField("code", e.target.value)}
              />
            </FormRow>

            <FormRow label="Title" htmlFor="title" required error={errors.title}>
              <Input
                id="title"
                placeholder="Introduction to Programming"
                value={form.title}
                error={Boolean(errors.title)}
                onChange={(e) => setField("title", e.target.value)}
              />
            </FormRow>

            <FormRow label="Credit hours" htmlFor="credit_hours" required error={errors.credit_hours}>
              <Input
                id="credit_hours"
                type="number"
                min="0"
                max="10"
                value={form.credit_hours}
                error={Boolean(errors.credit_hours)}
                onChange={(e) => setField("credit_hours", e.target.value)}
              />
            </FormRow>

            <FormRow label="Department" htmlFor="course_department" required error={errors.department_id}>
              <Select
                id="course_department"
                value={form.department_id === "" ? "" : String(form.department_id)}
                placeholder="Select a department"
                options={departments.map((department) => ({
                  value: String(department.id),
                  label: `${department.code} — ${department.name}`,
                }))}
                onChange={(value) => setField("department_id", value === "" ? "" : Number(value))}
              />
            </FormRow>
          </div>

          <div>
            <Checkbox
              label="Has a practical/lab component"
              checked={form.has_practical}
              onChange={(checked) => setField("has_practical", checked)}
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Controls whether the practical weight counts toward the final grade for this course&apos;s offerings.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Creating…" : "Create course"}
            </Button>
          </div>
        </ComponentCard>

        <ComponentCard title="Course catalog" desc={`${courses.length} course(s)`}>
          <DataTable
            columns={columns}
            rows={courses}
            rowKey={(row) => row.id}
            loading={loading}
            error={listError}
            emptyMessage="No courses yet."
          />
        </ComponentCard>
      </div>
    </div>
  );
}
