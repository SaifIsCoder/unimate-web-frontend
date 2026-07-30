"use client";

import React, { useMemo, useState } from "react";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import FormRow from "@/components/admin/FormRow";
import {
  validateWeights,
  weightsChanged,
  weightsFromOffering,
  weightsTotal,
  type Weights,
} from "@/lib/gradebook";
import type { Offering } from "@/types/academics";

type WeightsEditorProps = {
  offering: Offering;
  /** Whether the underlying course has a practical component. */
  hasPractical?: boolean;
  /** Enrolled student count, if known — makes the warning concrete. */
  affectedStudents?: number;
  submitting?: boolean;
  serverError?: string | null;
  onSave: (weights: Weights) => void;
  onCancel: () => void;
};

const FIELDS: { key: keyof Weights; label: string; hint: string }[] = [
  { key: "mid_weight", label: "Mid term", hint: "Share of the final grade." },
  { key: "sessional_weight", label: "Sessional", hint: "Pools assignments, quizzes, presentations and projects." },
  { key: "final_weight", label: "Final exam", hint: "Share of the final grade." },
  { key: "practical_weight", label: "Practical", hint: "Zero unless the course has a lab component." },
];

/**
 * Editor for an offering's assessment weights.
 *
 * These four numbers are multiplied into every enrolled student's grade by
 * `calculateRawMarks`, and nothing is snapshotted — the transcript recomputes
 * from live weights every time it is read. Changing them therefore rewrites
 * history for the whole class, which is why this screen leads with a warning
 * rather than burying it.
 */
export default function WeightsEditor({
  offering,
  hasPractical,
  affectedStudents,
  submitting = false,
  serverError = null,
  onSave,
  onCancel,
}: WeightsEditorProps) {
  const original = useMemo(() => weightsFromOffering(offering), [offering]);
  const [draft, setDraft] = useState<Record<keyof Weights, string>>({
    mid_weight: String(original.mid_weight),
    sessional_weight: String(original.sessional_weight),
    final_weight: String(original.final_weight),
    practical_weight: String(original.practical_weight),
  });
  const [acknowledged, setAcknowledged] = useState(false);

  const parsed: Weights = {
    mid_weight: Number(draft.mid_weight),
    sessional_weight: Number(draft.sessional_weight),
    final_weight: Number(draft.final_weight),
    practical_weight: Number(draft.practical_weight),
  };

  const issues = validateWeights(parsed, { hasPractical });
  const blocking = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const changed = weightsChanged(original, parsed);
  const total = weightsTotal(parsed);

  const setField = (key: keyof Weights, value: string) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setAcknowledged(false);
  };

  return (
    <div className="space-y-5">
      {/*
        Deliberately the loudest element on the screen. Weights are not applied
        at grading time and stored — every grade view recomputes from them, so
        a change is retroactive across the entire class and every past
        assessment.
      */}
      <div className="rounded-xl border-2 border-error-500 bg-error-50 p-4 dark:border-error-600 dark:bg-error-500/10">
        <div className="flex items-start gap-3">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            className="mt-0.5 shrink-0 text-error-600 dark:text-error-400"
            aria-hidden="true"
          >
            <path
              d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-error-700 dark:text-error-400">
              Changing weights rewrites existing grades
            </p>
            <p className="mt-1.5 text-sm text-error-700 dark:text-error-400">
              Weights are not stored with each grade — every final mark, letter
              grade, grade point and CGPA is recalculated from these numbers each
              time it is read. Saving will immediately change the computed result
              for{" "}
              <strong>
                {affectedStudents === undefined
                  ? "every enrolled student"
                  : `all ${affectedStudents} enrolled student(s)`}
              </strong>
              , including assessments that were marked weeks ago. Transcripts and
              the student mobile app update instantly, with no audit trail.
            </p>
            <p className="mt-1.5 text-sm text-error-700 dark:text-error-400">
              Only change these before marking begins, or with the registrar&apos;s
              agreement.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {FIELDS.map(({ key, label, hint }) => (
          <FormRow key={key} label={`${label} (%)`} htmlFor={key} required hint={hint}>
            <Input
              id={key}
              type="number"
              min="0"
              max="100"
              step={0.5}
              value={draft[key]}
              error={blocking.length > 0}
              onChange={(e) => setField(key, e.target.value)}
            />
          </FormRow>
        ))}
      </div>

      {/* Running total, because the API never checks it. */}
      <div
        className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
          Math.abs(total - 100) < 0.001
            ? "border-success-300 bg-success-50 dark:border-success-800 dark:bg-success-500/10"
            : "border-error-300 bg-error-50 dark:border-error-800 dark:bg-error-500/10"
        }`}
      >
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total</span>
        <span
          className={`text-lg font-bold ${
            Math.abs(total - 100) < 0.001
              ? "text-success-600 dark:text-success-400"
              : "text-error-600 dark:text-error-400"
          }`}
        >
          {Number.isNaN(total) ? "—" : `${total}%`}
        </span>
      </div>

      {blocking.map((issue, index) => (
        <p
          key={index}
          className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400"
        >
          {issue.message}
        </p>
      ))}

      {warnings.map((issue, index) => (
        <p
          key={index}
          className="rounded-lg border border-warning-300 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-700 dark:bg-warning-500/10 dark:text-warning-400"
        >
          {issue.message}
        </p>
      ))}

      {serverError && (
        <p className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
          {serverError}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <button
          type="button"
          disabled={submitting || !changed || blocking.length > 0}
          onClick={() => (acknowledged ? onSave(parsed) : setAcknowledged(true))}
          className="inline-flex items-center rounded-lg bg-error-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-error-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting
            ? "Saving…"
            : !changed
            ? "No changes"
            : acknowledged
            ? "Yes — rewrite grades for this class"
            : "Save new weights"}
        </button>
      </div>

      {acknowledged && changed && blocking.length === 0 && !submitting && (
        <p className="text-right text-xs text-error-600 dark:text-error-400">
          Press again to confirm. This takes effect immediately.
        </p>
      )}
    </div>
  );
}
