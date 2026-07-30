import { describe, expect, it } from "vitest";
import {
  gradePercentage,
  gradeTone,
  groupGradesByStudent,
  isReferenceBacked,
  validateWeights,
  weightsChanged,
  weightsTotal,
  type Weights,
} from "./gradebook";
import {
  isReferenceBackedPayload,
  type SubmitGradePayload,
} from "@/services/gradeService";
import type { AssessmentType, Grade } from "@/types/academics";

const weights = (over: Partial<Weights> = {}): Weights => ({
  mid_weight: 30,
  sessional_weight: 20,
  final_weight: 50,
  practical_weight: 0,
  ...over,
});

const grade = (over: Partial<Grade> = {}): Grade => ({
  id: "g1",
  enrollment_id: "e1",
  assessment_type: "midterm",
  reference_id: null,
  title: "Mid Term",
  score: "24",
  max_score: "30",
  roll_number: "FA21-BCS-001",
  email: "ali@unimate.edu",
  ...over,
});

describe("the payload split — the rule that governs POST /grades", () => {
  it("classifies the four reference-backed types", () => {
    for (const type of ["assignment", "quiz", "presentation", "project"] as AssessmentType[]) {
      expect(isReferenceBacked(type)).toBe(true);
    }
  });

  it("classifies the four direct types", () => {
    for (const type of ["sessional", "midterm", "final", "practical"] as AssessmentType[]) {
      expect(isReferenceBacked(type)).toBe(false);
    }
  });

  it("narrows a reference-backed payload", () => {
    const payload: SubmitGradePayload = {
      offering_id: "off-1",
      student_id: "stu-1",
      assessment_type: "quiz",
      reference_id: "assign-1",
      score: 8,
    };

    expect(isReferenceBackedPayload(payload)).toBe(true);
    if (isReferenceBackedPayload(payload)) {
      // The type guard must expose reference_id and must NOT expose max_score.
      expect(payload.reference_id).toBe("assign-1");
    }
  });

  it("narrows a direct payload", () => {
    const payload: SubmitGradePayload = {
      offering_id: "off-1",
      student_id: "stu-1",
      assessment_type: "midterm",
      title: "Mid Term",
      max_score: 30,
      score: 24,
    };

    expect(isReferenceBackedPayload(payload)).toBe(false);
    if (!isReferenceBackedPayload(payload)) {
      expect(payload.max_score).toBe(30);
    }
  });
});

describe("validateWeights — catches what the API does not", () => {
  it("accepts the default 30/20/50/0 split", () => {
    expect(validateWeights(weights())).toHaveLength(0);
  });

  it("accepts a valid split that includes practical", () => {
    expect(
      validateWeights(
        weights({ mid_weight: 25, sessional_weight: 25, final_weight: 40, practical_weight: 10 }),
        { hasPractical: true },
      ),
    ).toHaveLength(0);
  });

  it("errors when the total is under 100 — students would be silently capped", () => {
    // The API validates each weight 0-100 individually and never checks the sum,
    // so this ships happily and caps everyone at 90 marks.
    const issues = validateWeights(weights({ final_weight: 40 }));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toContain("capped at 90");
  });

  it("errors when the total is over 100", () => {
    const issues = validateWeights(weights({ final_weight: 60 }));
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toContain("above 100");
  });

  it("rejects out-of-range values before checking the total", () => {
    const issues = validateWeights(weights({ mid_weight: 120 }));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("between 0 and 100");
  });

  it("rejects negative values", () => {
    expect(validateWeights(weights({ mid_weight: -10 }))[0].severity).toBe("error");
  });

  it("rejects NaN", () => {
    expect(validateWeights(weights({ mid_weight: Number.NaN }))[0].message).toContain(
      "must be a number",
    );
  });

  it("tolerates floating-point drift on a valid total", () => {
    // 33.33 + 33.33 + 33.34 = 100.00000000000001 in IEEE 754.
    expect(
      validateWeights({
        mid_weight: 33.33,
        sessional_weight: 33.33,
        final_weight: 33.34,
        practical_weight: 0,
      }),
    ).toHaveLength(0);
  });

  it("warns when a practical weight is set on a course with no practical", () => {
    const issues = validateWeights(
      weights({ final_weight: 40, practical_weight: 10 }),
      { hasPractical: false },
    );
    expect(issues.some((i) => i.severity === "warning")).toBe(true);
  });

  it("warns when a practical course gives practical no weight", () => {
    const issues = validateWeights(weights(), { hasPractical: true });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
  });

  it("keeps a practical warning non-blocking — the total is still valid", () => {
    const issues = validateWeights(weights(), { hasPractical: true });
    expect(issues.every((i) => i.severity === "warning")).toBe(true);
  });
});

describe("weightsTotal / weightsChanged", () => {
  it("sums all four", () => {
    expect(weightsTotal(weights())).toBe(100);
  });

  it("detects a change in any field", () => {
    expect(weightsChanged(weights(), weights())).toBe(false);
    expect(weightsChanged(weights(), weights({ mid_weight: 31 }))).toBe(true);
    expect(weightsChanged(weights(), weights({ practical_weight: 1 }))).toBe(true);
  });
});

describe("gradePercentage", () => {
  it("computes a percentage from string decimals", () => {
    // pg returns Decimal columns as strings — never assume number.
    expect(gradePercentage(grade())).toBeCloseTo(80);
  });

  it("returns null rather than Infinity when max_score is zero", () => {
    expect(gradePercentage(grade({ max_score: "0" }))).toBeNull();
  });

  it("returns null for unparseable values", () => {
    expect(gradePercentage(grade({ score: "abc" }))).toBeNull();
  });
});

describe("groupGradesByStudent", () => {
  it("buckets every assessment under its student", () => {
    const grouped = groupGradesByStudent([
      grade({ id: "1", roll_number: "A" }),
      grade({ id: "2", roll_number: "A", assessment_type: "final" }),
      grade({ id: "3", roll_number: "B" }),
    ]);

    expect(grouped.get("A")).toHaveLength(2);
    expect(grouped.get("B")).toHaveLength(1);
  });

  it("handles an empty list", () => {
    expect(groupGradesByStudent([]).size).toBe(0);
  });
});

describe("gradeTone", () => {
  it("maps the UOS bands", () => {
    expect(gradeTone("A+")).toBe("success");
    expect(gradeTone("B-")).toBe("info");
    expect(gradeTone("C")).toBe("warning");
    expect(gradeTone("D+")).toBe("warning");
    expect(gradeTone("F")).toBe("error");
  });
});
