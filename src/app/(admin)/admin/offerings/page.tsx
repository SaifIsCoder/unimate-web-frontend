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
import WeightsEditor from "@/components/admin/WeightsEditor";
import { weightsFromOffering, weightsTotal } from "@/lib/gradebook";
import {
  createOffering,
  listCourses,
  listOfferings,
  listTeachers,
  updateOffering,
} from "@/services/academicService";
import {
  ASSESSMENT_WEIGHT_FIELDS,
  WEIGHT_LABELS,
  type AssessmentWeightField,
  type Course,
  type Offering,
  type Teacher,
  type PageMeta,
} from "@/types/academics";

type WeightForm = Record<AssessmentWeightField, string>;

type OfferingForm = {
  course_id: string;
  teacher_id: string;
  semester: string;
  section: string;
  capacity: string;
  weights: WeightForm;
};

// Mirrors the column defaults on course_offerings.
const DEFAULT_WEIGHTS: WeightForm = {
  mid_weight: "30",
  sessional_weight: "20",
  final_weight: "50",
  practical_weight: "0",
};

const emptyForm = (): OfferingForm => ({
  course_id: "",
  teacher_id: "",
  semester: "",
  section: "",
  capacity: "40",
  weights: { ...DEFAULT_WEIGHTS },
});

export default function OfferingsPage() {
  const [form, setForm] = useState<OfferingForm>(emptyForm);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [meta, setMeta] = useState<PageMeta | undefined>();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** Offering whose weights are being edited, if any. */
  const [weightsFor, setWeightsFor] = useState<Offering | null>(null);
  const [savingWeights, setSavingWeights] = useState(false);
  const [weightsError, setWeightsError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await listOfferings(page, limit);
      setOfferings(response.data);
      setMeta(response.meta);
      setListError(null);
    } catch (error) {
      setListError(errorMessage(error, "Could not load offerings."));
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  // Async closure keeps setState off the synchronous effect path; `alive`
  // guards against a response landing after unmount.
  useEffect(() => {
    let alive = true;

    void (async () => {
      // Courses and teachers only populate pickers, so they degrade to empty.
      const [courseResult, teacherResult, offeringResult] = await Promise.allSettled([
        listCourses(),
        listTeachers(),
        listOfferings(page, limit),
      ]);

      if (!alive) return;

      setCourses(courseResult.status === "fulfilled" ? courseResult.value.data : []);
      setTeachers(teacherResult.status === "fulfilled" ? teacherResult.value.data : []);

      if (offeringResult.status === "fulfilled") {
        setOfferings(offeringResult.value.data);
        setMeta(offeringResult.value.meta);
        setListError(null);
      } else {
        setListError(errorMessage(offeringResult.reason, "Could not load offerings."));
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [page, limit]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === form.course_id) ?? null,
    [courses, form.course_id],
  );

  const weightTotal = useMemo(
    () =>
      ASSESSMENT_WEIGHT_FIELDS.reduce(
        (sum, field) => sum + (Number(form.weights[field]) || 0),
        0,
      ),
    [form.weights],
  );

  // The server rejects anything that isn't exactly 100 (±0.01), so surface the
  // running total before the request is made.
  const weightsBalanced = Math.abs(weightTotal - 100) <= 0.01;

  const setField = <K extends keyof OfferingForm>(key: K, value: OfferingForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: "" }));
  };

  const setWeight = (field: AssessmentWeightField, value: string) => {
    setForm((previous) => ({
      ...previous,
      weights: { ...previous.weights, [field]: value },
    }));
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    const capacity = Number(form.capacity);

    if (!form.course_id) next.course_id = "Course is required.";
    if (form.semester.trim().length < 2) next.semester = "Semester is required (min 2 characters).";
    if (!form.section.trim()) next.section = "Section is required.";
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
      next.capacity = "Capacity must be a whole number from 1 to 500.";
    }

    for (const field of ASSESSMENT_WEIGHT_FIELDS) {
      const weight = Number(form.weights[field]);
      if (Number.isNaN(weight) || weight < 0 || weight > 100) {
        next[field] = "Must be between 0 and 100.";
      }
    }

    if (!weightsBalanced) {
      next.weights = `Assessment weights must total 100 — they currently total ${weightTotal}.`;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    setFeedback(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const created = await createOffering({
        course_id: form.course_id,
        teacher_id: form.teacher_id || null,
        semester: form.semester.trim(),
        section: form.section.trim(),
        capacity: Number(form.capacity),
        mid_weight: Number(form.weights.mid_weight),
        sessional_weight: Number(form.weights.sessional_weight),
        final_weight: Number(form.weights.final_weight),
        practical_weight: Number(form.weights.practical_weight),
      });
      setFeedback({
        variant: "success",
        title: "Offering created",
        message: `${created.course_code} section ${created.section} (${created.semester}) is ready for enrollment.`,
      });
      setForm({ ...emptyForm(), semester: form.semester });
      void refresh();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not create offering",
        message: errorMessage(error, "The server rejected the request."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<Offering>[] = [
    {
      key: "course",
      header: "Course",
      render: (row) => (
        <div>
          <p className="font-medium text-gray-800 dark:text-white/90">{row.course_code}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{row.course_title}</p>
        </div>
      ),
    },
    { key: "semester", header: "Semester", render: (row) => row.semester },
    { key: "section", header: "Section", render: (row) => row.section },
    { key: "capacity", header: "Capacity", render: (row) => row.capacity },
    {
      key: "teacher",
      header: "Teacher",
      render: (row) =>
        row.teacher_email ?? (
          <Badge size="sm" color="warning">
            Unassigned
          </Badge>
        ),
    },
    {
      key: "weights",
      header: "Weights (M/S/F/P)",
      render: (row) => {
        const total = weightsTotal(weightsFromOffering(row));
        return (
          <span className="flex items-center gap-2">
            {`${Number(row.mid_weight)}/${Number(row.sessional_weight)}/${Number(
              row.final_weight,
            )}/${Number(row.practical_weight)}`}
            {/* The API never checks weights sum to 100, so a bad set can already
                exist in the database — flag it wherever it is displayed. */}
            {Math.abs(total - 100) > 0.001 && (
              <Badge size="sm" color="error">
                {total}%
              </Badge>
            )}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (row) => (
        <button
          type="button"
          onClick={() => {
            setWeightsFor(row);
            setWeightsError(null);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
        >
          Edit weights
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageBreadcrumb pageTitle="Course Offerings" />

      <div className="space-y-6">
        {weightsFor && (
          <ComponentCard
            title={`Assessment weights — ${weightsFor.course_code} · ${weightsFor.section}`}
            desc={`${weightsFor.course_title} · ${weightsFor.semester}`}
          >
            <WeightsEditor
              offering={weightsFor}
              submitting={savingWeights}
              serverError={weightsError}
              onCancel={() => {
                setWeightsFor(null);
                setWeightsError(null);
              }}
              onSave={async (weights) => {
                setSavingWeights(true);
                setWeightsError(null);
                try {
                  await updateOffering(weightsFor.id, weights);
                  setFeedback({
                    variant: "success",
                    title: "Weights updated",
                    message: `${weightsFor.course_code} · ${weightsFor.section} now uses ${weights.mid_weight}/${weights.sessional_weight}/${weights.final_weight}/${weights.practical_weight}. Every grade on this offering has been recalculated.`,
                  });
                  setWeightsFor(null);
                  void refresh();
                } catch (error) {
                  setWeightsError(
                    errorMessage(error, "The server rejected the new weights."),
                  );
                } finally {
                  setSavingWeights(false);
                }
              }}
            />
          </ComponentCard>
        )}

        <ComponentCard
          title="Create an offering"
          desc="An offering is one section of a course in one semester, taught by one teacher. Assessment weights are set here and drive every final grade calculated for it."
        >
          <FeedbackBanner feedback={feedback} />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormRow label="Course" htmlFor="course_id" required error={errors.course_id}>
              <Select
                id="course_id"
                value={form.course_id}
                placeholder="Select a course"
                options={courses.map((course) => ({
                  value: course.id,
                  label: `${course.code} — ${course.title}`,
                }))}
                onChange={(value) => setField("course_id", value)}
              />
            </FormRow>

            <FormRow
              label="Teacher"
              htmlFor="teacher_id"
              hint="Optional now, but grading, attendance and scheduling all key off the assigned teacher."
            >
              <Select
                id="teacher_id"
                value={form.teacher_id}
                placeholder="Leave unassigned"
                options={teachers.map((teacher) => ({
                  value: teacher.id,
                  label: `${teacher.email} (${teacher.employee_id})`,
                }))}
                onChange={(value) => setField("teacher_id", value)}
              />
            </FormRow>

            <FormRow label="Semester" htmlFor="semester" required error={errors.semester}>
              <Input
                id="semester"
                placeholder="Fall 2026"
                value={form.semester}
                error={Boolean(errors.semester)}
                onChange={(e) => setField("semester", e.target.value)}
              />
            </FormRow>

            <FormRow label="Section" htmlFor="section" required error={errors.section}>
              <Input
                id="section"
                placeholder="A"
                value={form.section}
                error={Boolean(errors.section)}
                onChange={(e) => setField("section", e.target.value)}
              />
            </FormRow>

            <FormRow label="Capacity" htmlFor="capacity" required error={errors.capacity}>
              <Input
                id="capacity"
                type="number"
                min="1"
                max="500"
                value={form.capacity}
                error={Boolean(errors.capacity)}
                onChange={(e) => setField("capacity", e.target.value)}
              />
            </FormRow>
          </div>

          <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-medium text-gray-800 dark:text-white/90">
                  Assessment weights
                </h4>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Percentage each component contributes to the final grade. Must total 100.
                </p>
              </div>
              <Badge size="sm" color={weightsBalanced ? "success" : "error"}>
                Total: {weightTotal}%
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
              {ASSESSMENT_WEIGHT_FIELDS.map((field) => {
                const practicalUnused =
                  field === "practical_weight" && selectedCourse?.has_practical === false;

                return (
                  <FormRow
                    key={field}
                    label={WEIGHT_LABELS[field]}
                    htmlFor={field}
                    error={errors[field]}
                    hint={practicalUnused ? "This course has no practical." : undefined}
                  >
                    <Input
                      id={field}
                      type="number"
                      min="0"
                      max="100"
                      value={form.weights[field]}
                      error={Boolean(errors[field]) || !weightsBalanced}
                      onChange={(e) => setWeight(field, e.target.value)}
                    />
                  </FormRow>
                );
              })}
            </div>

            {errors.weights && (
              <p className="mt-3 text-xs text-error-500">{errors.weights}</p>
            )}

            {selectedCourse?.has_practical === false &&
              Number(form.weights.practical_weight) > 0 && (
                <p className="mt-3 text-xs text-warning-500">
                  {selectedCourse.code} is not marked as having a practical, so a non-zero practical
                  weight will not be applied when grades are calculated.
                </p>
              )}
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Creating…" : "Create offering"}
            </Button>
          </div>
        </ComponentCard>

        <ComponentCard title="Offerings" desc={`${offerings.length} offering(s)`}>
          <DataTable
            columns={columns}
            rows={offerings}
            rowKey={(row) => row.id}
            loading={loading}
            error={listError}
            emptyMessage="No offerings yet."
            pagination={meta}
            onPageChange={setPage}
          />
        </ComponentCard>
      </div>
    </div>
  );
}
