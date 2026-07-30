import { describe, expect, it } from "vitest";
import {
  defaultDueDate,
  findDuplicate,
  hasErrors,
  isOverdue,
  isPastDue,
  toIsoDueDate,
  toLocalInputValue,
  validateAssignmentForm,
} from "./assignments";
import type { Assignment } from "@/types/academics";

const assignment = (over: Partial<Assignment> = {}): Assignment => ({
  id: "a1",
  offering_id: "off-1",
  title: "Linked List Lab",
  description: "Implement a doubly linked list.",
  assessment_type: "assignment",
  due_date: "2026-12-01T23:59:00.000Z",
  total_points: "20",
  is_done: false,
  difficulty: "Medium",
  priority: "Normal",
  ...over,
});

const NOW = new Date("2026-07-30T12:00:00.000Z");

describe("date helpers", () => {
  it("round-trips a local input value", () => {
    const value = toLocalInputValue(new Date(2026, 7, 3, 14, 30));
    expect(value).toBe("2026-08-03T14:30");
  });

  it("zero-pads every component", () => {
    expect(toLocalInputValue(new Date(2026, 0, 5, 9, 7))).toBe("2026-01-05T09:07");
  });

  it("converts a local input value to ISO for the API", () => {
    // The input carries no timezone, so it means local time — which is what a
    // teacher intends by "due at 5pm".
    const iso = toIsoDueDate("2026-08-03T17:00");
    expect(iso).toBe(new Date(2026, 7, 3, 17, 0).toISOString());
    expect(iso.endsWith("Z")).toBe(true);
  });

  it("defaults to a week out at 23:59", () => {
    const value = defaultDueDate(NOW);
    expect(value.endsWith("T23:59")).toBe(true);
    expect(new Date(value).getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe("isPastDue — mirrors the server's 400", () => {
  it("flags a past date", () => {
    expect(isPastDue("2026-07-01T10:00", NOW)).toBe(true);
  });

  it("accepts a future date", () => {
    expect(isPastDue("2026-12-01T10:00", NOW)).toBe(false);
  });

  it("treats 'exactly now' as past, matching the server's < comparison", () => {
    expect(isPastDue(toLocalInputValue(NOW), NOW)).toBe(true);
  });

  it("does not flag an unparseable value — that is a different error", () => {
    expect(isPastDue("", NOW)).toBe(false);
    expect(isPastDue("nonsense", NOW)).toBe(false);
  });
});

describe("findDuplicate — mirrors the server's 409", () => {
  const existing = [
    assignment({ id: "a1", title: "Lab 1", description: "Do the thing." }),
    assignment({ id: "a2", title: "Lab 2", description: null }),
  ];

  it("matches on title AND description together", () => {
    expect(findDuplicate(existing, { title: "Lab 1", description: "Do the thing." })?.id).toBe(
      "a1",
    );
  });

  it("does not match when only the title repeats", () => {
    expect(findDuplicate(existing, { title: "Lab 1", description: "Different." })).toBeNull();
  });

  it("does not match when only the description repeats", () => {
    expect(findDuplicate(existing, { title: "Lab 9", description: "Do the thing." })).toBeNull();
  });

  it("treats null and empty description as equal, like COALESCE(description,'')", () => {
    expect(findDuplicate(existing, { title: "Lab 2", description: "" })?.id).toBe("a2");
    expect(findDuplicate(existing, { title: "Lab 2" })?.id).toBe("a2");
    expect(findDuplicate(existing, { title: "Lab 2", description: null })?.id).toBe("a2");
  });

  it("trims before comparing, because the payload is trimmed before sending", () => {
    expect(findDuplicate(existing, { title: "  Lab 1  ", description: " Do the thing. " })?.id).toBe(
      "a1",
    );
  });

  it("excludes the assignment being edited", () => {
    expect(
      findDuplicate(existing, { title: "Lab 1", description: "Do the thing." }, "a1"),
    ).toBeNull();
  });

  it("returns null against an empty list", () => {
    expect(findDuplicate([], { title: "Lab 1" })).toBeNull();
  });
});

describe("validateAssignmentForm", () => {
  const valid = { title: "Lab 1", due_date: "2026-12-01T23:59", total_points: "20" };

  it("passes a well-formed entry", () => {
    expect(hasErrors(validateAssignmentForm(valid, { now: NOW }))).toBe(false);
  });

  it("requires a title", () => {
    expect(validateAssignmentForm({ ...valid, title: "   " }, { now: NOW }).title).toBeDefined();
  });

  it("requires total points above zero", () => {
    for (const points of ["0", "-5", "", "abc"]) {
      expect(
        validateAssignmentForm({ ...valid, total_points: points }, { now: NOW }).total_points,
      ).toBeDefined();
    }
  });

  it("accepts fractional points, which the server allows", () => {
    expect(
      validateAssignmentForm({ ...valid, total_points: "12.5" }, { now: NOW }).total_points,
    ).toBeUndefined();
  });

  it("requires a due date", () => {
    expect(validateAssignmentForm({ ...valid, due_date: "" }, { now: NOW }).due_date).toBeDefined();
  });

  it("rejects a past due date", () => {
    expect(
      validateAssignmentForm({ ...valid, due_date: "2026-01-01T10:00" }, { now: NOW }).due_date,
    ).toBeDefined();
  });

  it("skips the past-date rule when the due date is not being changed", () => {
    // Editing an already-overdue assignment must not be blocked on a field the
    // teacher never touched — the payload omits it, so the server never sees it.
    expect(
      validateAssignmentForm(
        { ...valid, due_date: "2026-01-01T10:00" },
        { now: NOW, checkDueDate: false },
      ).due_date,
    ).toBeUndefined();
  });

  it("reports every problem at once rather than one at a time", () => {
    const errors = validateAssignmentForm(
      { title: "", due_date: "", total_points: "0" },
      { now: NOW },
    );
    expect(Object.keys(errors)).toHaveLength(3);
  });
});

describe("isOverdue", () => {
  it("flags a passed deadline that is not done", () => {
    expect(isOverdue(assignment({ due_date: "2026-07-01T00:00:00.000Z" }), NOW)).toBe(true);
  });

  it("does not flag a completed assignment", () => {
    expect(
      isOverdue(assignment({ due_date: "2026-07-01T00:00:00.000Z", is_done: true }), NOW),
    ).toBe(false);
  });

  it("does not flag a future deadline", () => {
    expect(isOverdue(assignment({ due_date: "2026-12-01T00:00:00.000Z" }), NOW)).toBe(false);
  });
});
