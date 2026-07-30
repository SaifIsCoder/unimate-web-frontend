"use client";

import React, { useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import { errorMessage } from "@/components/admin/FeedbackBanner";
import { getGradeCalculation } from "@/services/gradeService";
import { gradeTone } from "@/lib/gradebook";
import type { GradeCalculation, TeachingOffering } from "@/types/academics";

type GradeCalculationCardProps = {
  studentId: string;
  studentLabel: string;
  offering: TeachingOffering;
  onClose: () => void;
};

const COMPONENTS = [
  { key: "mid_term", label: "Mid term", weightKey: "mid_weight" },
  { key: "sessional", label: "Sessional", weightKey: "sessional_weight" },
  { key: "final_exam", label: "Final exam", weightKey: "final_weight" },
  { key: "practical", label: "Practical", weightKey: "practical_weight" },
] as const;

/**
 * The weighted breakdown for one student, straight from
 * `GET /grades/.../calculation`.
 *
 * Nothing here is recomputed client-side. The server owns the weighting, the
 * `Math.ceil` rounding and the UOS letter-grade scale, and a second
 * implementation would eventually disagree with the transcript — which is the
 * document that actually counts.
 */
export default function GradeCalculationCard({
  studentId,
  studentLabel,
  offering,
  onClose,
}: GradeCalculationCardProps) {
  const [calculation, setCalculation] = useState<GradeCalculation | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loading = loadedFor !== studentId;

  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const result = await getGradeCalculation(studentId, offering.id);
        if (!alive) return;
        setCalculation(result);
        setError(null);
      } catch (caught) {
        if (alive) {
          setCalculation(null);
          setError(errorMessage(caught, "Could not calculate this student's grade."));
        }
      } finally {
        if (alive) setLoadedFor(studentId);
      }
    })();

    return () => {
      alive = false;
    };
  }, [studentId, offering.id]);

  const weightOf = (key: (typeof COMPONENTS)[number]["weightKey"]): number =>
    Number(offering[key]);

  return (
    <div className="rounded-xl border border-brand-300 bg-brand-50/40 p-4 dark:border-brand-800 dark:bg-brand-500/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Weighted breakdown — {studentLabel}
          </h4>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Calculated by the server using this offering&apos;s weights.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-gray-400 transition hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="Close breakdown"
        >
          ✕
        </button>
      </div>

      {loading && (
        <div className="mt-4 h-20 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      )}

      {!loading && error && (
        <p className="mt-4 text-sm text-error-600 dark:text-error-400">{error}</p>
      )}

      {!loading && calculation && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Raw marks" value={calculation.raw_marks.toFixed(2)} />
            {/* The server rounds UP: 81.4 becomes 82, which can cross a grade
                boundary — worth showing both so the jump is not a mystery. */}
            <Metric
              label="Final marks"
              value={String(calculation.final_marks)}
              hint="Rounded up"
            />
            <Metric
              label="Grade"
              value={
                <Badge size="sm" color={gradeTone(calculation.letter_grade)}>
                  {calculation.letter_grade}
                </Badge>
              }
            />
            <Metric label="Grade point" value={calculation.grade_point.toFixed(2)} />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="pb-2 font-medium">Component</th>
                  <th className="pb-2 text-right font-medium">Achieved</th>
                  <th className="pb-2 text-right font-medium">Weight</th>
                  <th className="pb-2 text-right font-medium">Contributes</th>
                </tr>
              </thead>
              <tbody>
                {COMPONENTS.map(({ key, label, weightKey }) => {
                  const achieved = calculation.components[key];
                  const weight = weightOf(weightKey);
                  const contributes = (achieved * weight) / 100;

                  // A practical row on a course with no practical component is
                  // always zero — say so rather than showing a bare 0%.
                  const notApplicable = key === "practical" && !calculation.has_practical;

                  return (
                    <tr
                      key={key}
                      className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                    >
                      <td className="py-2 text-gray-700 dark:text-gray-300">{label}</td>
                      <td className="py-2 text-right text-gray-700 dark:text-gray-300">
                        {notApplicable ? (
                          <span className="text-gray-400">n/a</span>
                        ) : (
                          `${achieved.toFixed(1)}%`
                        )}
                      </td>
                      <td className="py-2 text-right text-gray-500 dark:text-gray-400">
                        {weight}%
                      </td>
                      <td className="py-2 text-right font-medium text-gray-800 dark:text-white/90">
                        {notApplicable ? "—" : contributes.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Components are percentages of their own maximum. Sessional pools every
            assignment, quiz, presentation and project into a single percentage
            before weighting.
          </p>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 dark:bg-gray-900">
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold text-gray-800 dark:text-white/90">{value}</p>
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}
