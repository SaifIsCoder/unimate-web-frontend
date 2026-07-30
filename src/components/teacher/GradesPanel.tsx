"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { listGradesByOffering, submitGradeColumn } from "@/services/teachingService";
import {
  ASSESSMENT_TYPES,
  REFERENCE_BACKED_ASSESSMENTS,
  type AssessmentType,
  type Enrollment,
  type Grade,
  type TeachingOffering,
} from "@/types/academics";

type GradesPanelProps = {
  offering: TeachingOffering;
  roster: Enrollment[];
  rosterLoading: boolean;
};

const TYPE_LABELS: Record<AssessmentType, string> = {
  midterm: "Mid term",
  sessional: "Sessional",
  final: "Final exam",
  practical: "Practical",
  quiz: "Quiz",
  assignment: "Assignment",
  presentation: "Presentation",
  project: "Project",
};

export default function GradesPanel({ offering, roster, rosterLoading }: GradesPanelProps) {
  const [assessmentType, setAssessmentType] = useState<AssessmentType>("midterm");
  const [title, setTitle] = useState("Mid term");
  const [maxScore, setMaxScore] = useState("100");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loadingGrades, setLoadingGrades] = useState(true);
  const [gradesError, setGradesError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const activeRoster = useMemo(
    () => roster.filter((row) => row.status === "enrolled"),
    [roster],
  );

  const refreshGrades = useCallback(async () => {
    setLoadingGrades(true);
    try {
      const page = await listGradesByOffering(offering.id);
      setGrades(page.data);
      setGradesError(null);
    } catch (error) {
      setGradesError(errorMessage(error, "Could not load the gradebook."));
    } finally {
      setLoadingGrades(false);
    }
  }, [offering.id]);

  // Async closure keeps setState off the synchronous effect path; `alive`
  // guards against a response landing after the teacher switches class.
  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const page = await listGradesByOffering(offering.id);
        if (alive) {
          setGrades(page.data);
          setGradesError(null);
        }
      } catch (error) {
        if (alive) setGradesError(errorMessage(error, "Could not load the gradebook."));
      } finally {
        if (alive) setLoadingGrades(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [offering.id]);

  // Reference-backed types take their title and max score from a linked
  // assignment, which lives in the assignments module rather than here.
  const needsReference = REFERENCE_BACKED_ASSESSMENTS.includes(assessmentType);

  const weightFor = (type: AssessmentType): string | null => {
    if (type === "midterm") return offering.mid_weight;
    if (type === "sessional") return offering.sessional_weight;
    if (type === "final") return offering.final_weight;
    if (type === "practical") return offering.practical_weight;
    return null;
  };

  const currentWeight = weightFor(assessmentType);

  const handleTypeChange = (value: string) => {
    const next = value as AssessmentType;
    setAssessmentType(next);
    setTitle(TYPE_LABELS[next]);
    setErrors({});
    setFeedback(null);
  };

  const entries = useMemo(
    () =>
      activeRoster
        .map((row) => ({
          studentId: row.student_id,
          rollNumber: row.roll_number,
          raw: scores[row.student_id] ?? "",
        }))
        .filter((entry) => entry.raw.trim() !== ""),
    [activeRoster, scores],
  );

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    const max = Number(maxScore);

    if (!title.trim()) next.title = "A title is required for this assessment type.";
    if (!Number.isFinite(max) || max <= 0) next.maxScore = "Max score must be a positive number.";
    if (entries.length === 0) next.scores = "Enter at least one score.";

    for (const entry of entries) {
      const score = Number(entry.raw);
      if (!Number.isFinite(score) || score < 0) {
        next[entry.studentId] = "Invalid";
      } else if (Number.isFinite(max) && score > max) {
        next[entry.studentId] = `> ${max}`;
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    setFeedback(null);
    if (needsReference) {
      setFeedback({
        variant: "error",
        title: "Not gradable here",
        message: `${TYPE_LABELS[assessmentType]} scores are tied to a specific assignment and take their title and max score from it. Grade those from the assignments module.`,
      });
      return;
    }
    if (!validate()) return;

    setSubmitting(true);
    try {
      const outcome = await submitGradeColumn(
        {
          offering_id: offering.id,
          assessment_type: assessmentType,
          title: title.trim(),
          max_score: Number(maxScore),
        },
        entries.map((entry) => ({
          studentId: entry.studentId,
          rollNumber: entry.rollNumber,
          score: Number(entry.raw),
        })),
      );

      if (outcome.failures.length === 0) {
        setFeedback({
          variant: "success",
          title: "Grades saved",
          message: `${outcome.submitted} score(s) recorded for ${title.trim()}. Re-submitting a student overwrites their previous score for this assessment.`,
        });
        setScores({});
      } else {
        setFeedback({
          variant: "error",
          title: `${outcome.submitted} saved, ${outcome.failures.length} failed`,
          message: outcome.failures
            .map((failure) => `${failure.rollNumber}: ${failure.message}`)
            .join(" · "),
        });
      }
      await refreshGrades();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not save grades",
        message: errorMessage(error, "The server rejected the request."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const gradeColumns: Column<Grade>[] = [
    { key: "roll", header: "Roll number", render: (row) => row.roll_number },
    {
      key: "type",
      header: "Assessment",
      render: (row) => (
        <Badge size="sm" color="light">
          {TYPE_LABELS[row.assessment_type] ?? row.assessment_type}
        </Badge>
      ),
    },
    { key: "title", header: "Title", render: (row) => row.title },
    {
      key: "score",
      header: "Score",
      render: (row) => `${Number(row.score)} / ${Number(row.max_score)}`,
    },
    {
      key: "pct",
      header: "%",
      render: (row) => {
        const max = Number(row.max_score);
        return max > 0 ? `${Math.round((Number(row.score) / max) * 100)}%` : "—";
      },
    },
  ];

  return (
    <div className="space-y-6">
      <ComponentCard
        title="Enter grades"
        desc="Pick an assessment, then enter scores for the students you want to record. Blank rows are skipped."
      >
        <FeedbackBanner feedback={feedback} />

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <FormRow
            label="Assessment type"
            htmlFor="assessment_type"
            required
            hint={
              currentWeight !== null
                ? `Counts for ${Number(currentWeight)}% of the final grade.`
                : undefined
            }
          >
            <Select
              id="assessment_type"
              value={assessmentType}
              options={ASSESSMENT_TYPES.map((type) => ({
                value: type,
                label: TYPE_LABELS[type],
              }))}
              onChange={handleTypeChange}
            />
          </FormRow>

          <FormRow label="Title" htmlFor="grade_title" required error={errors.title}>
            <Input
              id="grade_title"
              value={title}
              disabled={needsReference}
              error={Boolean(errors.title)}
              onChange={(e) => setTitle(e.target.value)}
            />
          </FormRow>

          <FormRow label="Max score" htmlFor="max_score" required error={errors.maxScore}>
            <Input
              id="max_score"
              type="number"
              min="1"
              value={maxScore}
              disabled={needsReference}
              error={Boolean(errors.maxScore)}
              onChange={(e) => setMaxScore(e.target.value)}
            />
          </FormRow>
        </div>

        {needsReference && (
          <p className="rounded-lg border border-warning-500 bg-warning-50 p-3 text-sm text-warning-600 dark:border-warning-500/30 dark:bg-warning-500/15 dark:text-orange-400">
            {TYPE_LABELS[assessmentType]} grades must reference an existing assignment, which
            supplies their title and max score. Record them from the assignments module
            instead — submitting here would be rejected.
          </p>
        )}

        {errors.scores && <p className="text-xs text-error-500">{errors.scores}</p>}

        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          {rosterLoading ? (
            <p className="p-5 text-sm text-gray-500 dark:text-gray-400">Loading roster…</p>
          ) : activeRoster.length === 0 ? (
            <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
              No actively enrolled students to grade.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {activeRoster.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                      {row.roll_number}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {row.student_email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-28">
                      <Input
                        type="number"
                        min="0"
                        placeholder="—"
                        value={scores[row.student_id] ?? ""}
                        disabled={needsReference}
                        error={Boolean(errors[row.student_id])}
                        onChange={(e) =>
                          setScores((previous) => ({
                            ...previous,
                            [row.student_id]: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <span className="w-16 text-xs text-error-500">
                      {errors[row.student_id] ?? ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {entries.length} score(s) ready to submit. Each is sent as its own request —
            the API grades one student at a time.
          </p>
          <Button
            onClick={handleSubmit}
            disabled={submitting || needsReference || activeRoster.length === 0}
          >
            {submitting ? "Saving…" : "Save grades"}
          </Button>
        </div>
      </ComponentCard>

      <ComponentCard title="Gradebook" desc={`${grades.length} recorded grade(s)`}>
        <DataTable
          columns={gradeColumns}
          rows={grades}
          rowKey={(row) => row.id}
          loading={loadingGrades}
          error={gradesError}
          emptyMessage="No grades recorded for this class yet."
        />
      </ComponentCard>
    </div>
  );
}
