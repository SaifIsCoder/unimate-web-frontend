import type { Assignment } from "@/types/academics";

/**
 * Assignment form rules, kept pure so they can be tested without React.
 *
 * Each mirrors a specific server rejection. Catching them locally turns a
 * round trip into instant feedback; the server stays authoritative, and its
 * message is still surfaced if the two ever disagree.
 */

/** Value for a `datetime-local` input, in the browser's local timezone. */
export const toLocalInputValue = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

/**
 * `datetime-local` value → ISO 8601 for the API.
 *
 * The input has no timezone, so it is interpreted as local time — which is what
 * a teacher means by "due at 5pm". `toISOString` then converts to UTC, and the
 * server's `Joi.date().iso()` accepts it.
 */
export const toIsoDueDate = (localValue: string): string =>
  new Date(localValue).toISOString();

/** A sensible default: next week, 23:59 local. */
export const defaultDueDate = (now: Date = new Date()): string => {
  const due = new Date(now);
  due.setDate(due.getDate() + 7);
  due.setHours(23, 59, 0, 0);
  return toLocalInputValue(due);
};

export const isPastDue = (localValue: string, now: Date = new Date()): boolean => {
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() <= now.getTime();
};

/**
 * The server's duplicate rule: same offering, same title, same description.
 *
 * It compares `COALESCE(description, '')`, so null and "" collide — mirrored
 * here with `?? ""`. Titles are compared exactly (no trim, no case folding) by
 * the SQL, but we trim first because the payload is trimmed before sending.
 */
export const findDuplicate = (
  assignments: Assignment[],
  candidate: { title: string; description?: string | null },
  ignoreId?: string,
): Assignment | null => {
  const title = candidate.title.trim();
  const description = (candidate.description ?? "").trim();

  return (
    assignments.find(
      (existing) =>
        existing.id !== ignoreId &&
        existing.title === title &&
        (existing.description ?? "").trim() === description,
    ) ?? null
  );
};

export type AssignmentFormErrors = {
  title?: string;
  due_date?: string;
  total_points?: string;
};

/**
 * Field validation mirroring the create/update schemas: title required,
 * `total_points` strictly positive, due date required and in the future.
 *
 * The past-due rule is deliberately NOT applied when editing an assignment
 * whose deadline has already passed but is unchanged — the server only
 * validates the value it receives, so omitting an untouched `due_date` avoids a
 * 400 that the teacher can do nothing about.
 */
export const validateAssignmentForm = (
  form: { title: string; due_date: string; total_points: string },
  options: { checkDueDate?: boolean; now?: Date } = {},
): AssignmentFormErrors => {
  const { checkDueDate = true, now = new Date() } = options;
  const errors: AssignmentFormErrors = {};

  if (!form.title.trim()) {
    errors.title = "Title is required.";
  }

  const points = Number(form.total_points);
  if (!form.total_points.trim() || Number.isNaN(points) || points <= 0) {
    errors.total_points = "Total points must be greater than zero.";
  }

  if (!form.due_date) {
    errors.due_date = "Due date is required.";
  } else if (checkDueDate && isPastDue(form.due_date, now)) {
    errors.due_date = "Due date must be in the future — the server rejects past dates.";
  }

  return errors;
};

export const hasErrors = (errors: AssignmentFormErrors): boolean =>
  Object.values(errors).some(Boolean);

/** Overdue = deadline passed and not yet marked done. */
export const isOverdue = (assignment: Assignment, now: Date = new Date()): boolean =>
  !assignment.is_done && new Date(assignment.due_date).getTime() < now.getTime();
