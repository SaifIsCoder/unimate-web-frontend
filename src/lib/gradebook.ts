import type { AssessmentType, Grade, Offering } from "@/types/academics";
import { REFERENCE_BACKED_ASSESSMENTS } from "@/types/academics";

/**
 * Gradebook rules, kept pure so the parts most likely to break silently are
 * testable without React.
 */

/** Assessment types whose title and max score come from a linked assignment. */
export const isReferenceBacked = (type: AssessmentType): boolean =>
  REFERENCE_BACKED_ASSESSMENTS.includes(type);

// ── Offering weights ─────────────────────────────────────────────────────────

export type Weights = {
  mid_weight: number;
  sessional_weight: number;
  final_weight: number;
  practical_weight: number;
};

export const weightsTotal = (weights: Weights): number =>
  weights.mid_weight +
  weights.sessional_weight +
  weights.final_weight +
  weights.practical_weight;

export type WeightsIssue = {
  severity: "error" | "warning";
  message: string;
};

/**
 * Validates a weight set.
 *
 * The API only checks each value is 0–100 individually — it never checks they
 * sum to 100. A set totalling 90 silently caps every student at 90 marks, and
 * one totalling 110 can push them over 100. Both are severe and neither is
 * reported by the server, so they are surfaced here.
 *
 * A non-100 total is an **error** in the UI even though the API would accept
 * it: there is no legitimate reason to want it, and the failure mode is
 * invisible until grades look wrong weeks later.
 */
export const validateWeights = (
  weights: Weights,
  options: { hasPractical?: boolean } = {},
): WeightsIssue[] => {
  const issues: WeightsIssue[] = [];
  const values = Object.entries(weights) as [keyof Weights, number][];

  for (const [key, value] of values) {
    if (Number.isNaN(value)) {
      issues.push({ severity: "error", message: `${LABEL[key]} must be a number.` });
    } else if (value < 0 || value > 100) {
      issues.push({ severity: "error", message: `${LABEL[key]} must be between 0 and 100.` });
    }
  }

  if (issues.length > 0) return issues;

  const total = weightsTotal(weights);
  if (Math.abs(total - 100) > 0.001) {
    issues.push({
      severity: "error",
      message: `Weights total ${total}%, not 100%. ${
        total < 100
          ? `Every student would be capped at ${total} marks.`
          : "Students could score above 100 marks."
      }`,
    });
  }

  // A practical weight on a course with no practical component silently
  // discards that share of the grade: the calculation multiplies a practical
  // score of 0 by the weight.
  if (options.hasPractical === false && weights.practical_weight > 0) {
    issues.push({
      severity: "warning",
      message:
        "This course has no practical component, so its practical weight will always contribute zero — effectively lowering the maximum achievable mark.",
    });
  }

  if (options.hasPractical === true && weights.practical_weight === 0) {
    issues.push({
      severity: "warning",
      message:
        "This course has a practical component but it carries no weight, so practical marks will not affect the final grade.",
    });
  }

  return issues;
};

const LABEL: Record<keyof Weights, string> = {
  mid_weight: "Mid term",
  sessional_weight: "Sessional",
  final_weight: "Final exam",
  practical_weight: "Practical",
};

export const weightsFromOffering = (offering: Offering): Weights => ({
  mid_weight: Number(offering.mid_weight),
  sessional_weight: Number(offering.sessional_weight),
  final_weight: Number(offering.final_weight),
  practical_weight: Number(offering.practical_weight),
});

export const weightsChanged = (a: Weights, b: Weights): boolean =>
  (Object.keys(a) as (keyof Weights)[]).some((key) => a[key] !== b[key]);

// ── Grade helpers ────────────────────────────────────────────────────────────

/** Percentage for one grade row, or null when max_score is missing/zero. */
export const gradePercentage = (grade: Grade): number | null => {
  const score = Number(grade.score);
  const max = Number(grade.max_score);
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return null;
  return (score / max) * 100;
};

/**
 * Groups a class's grades by student, so a gradebook row can show every
 * assessment for one student.
 */
export const groupGradesByStudent = (grades: Grade[]): Map<string, Grade[]> => {
  const byStudent = new Map<string, Grade[]>();

  for (const grade of grades) {
    const bucket = byStudent.get(grade.roll_number) ?? [];
    bucket.push(grade);
    byStudent.set(grade.roll_number, bucket);
  }

  return byStudent;
};

/** UOS colour banding for a letter grade, used consistently across views. */
export const gradeTone = (letter: string): "success" | "info" | "warning" | "error" => {
  if (letter.startsWith("A")) return "success";
  if (letter.startsWith("B")) return "info";
  if (letter.startsWith("C") || letter.startsWith("D")) return "warning";
  return "error";
};

/**
 * Attendance eligibility threshold, for display only.
 *
 * The authoritative decision is `eligible_for_exam` from the API, which
 * excludes approved leaves from the denominator. This constant exists to label
 * the rule in the UI, never to recompute it.
 */
export const ATTENDANCE_THRESHOLD = 75;
