"use client";

import React, { useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Select from "@/components/form/Select";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import FormRow from "@/components/admin/FormRow";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import FeedbackBanner, {
  errorMessage,
  type Feedback,
} from "@/components/admin/FeedbackBanner";
import {
  createAssignment,
  deleteAssignment,
  listAssignmentsByOffering,
  markAssignmentDone,
  updateAssignment,
} from "@/services/assignmentService";
import {
  defaultDueDate,
  findDuplicate,
  hasErrors,
  isOverdue,
  toIsoDueDate,
  toLocalInputValue,
  validateAssignmentForm,
  type AssignmentFormErrors,
} from "@/lib/assignments";
import {
  ASSIGNMENT_TYPES,
  type Assignment,
  type AssignmentType,
  type TeachingOffering,
} from "@/types/academics";

type AssignmentsPanelProps = {
  offering: TeachingOffering;
};

type FormState = {
  title: string;
  description: string;
  assessment_type: AssignmentType;
  due_date: string;
  total_points: string;
};

const emptyForm = (): FormState => ({
  title: "",
  description: "",
  assessment_type: "assignment",
  due_date: defaultDueDate(),
  total_points: "20",
});

const TYPE_LABEL: Record<AssignmentType, string> = {
  assignment: "Assignment",
  quiz: "Quiz",
  presentation: "Presentation",
  project: "Project",
};

/**
 * The assignment id, shown because Phase 5 needs it.
 *
 * `POST /grades` requires this exact value as `reference_id` for every
 * assignment-backed assessment type, so surfacing and making it copyable turns
 * an opaque lookup into a one-click operation.
 */
function AssignmentId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(id).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      title="Copy assignment ID — used as reference_id when grading"
      className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1 font-mono text-[11px] text-gray-600 transition hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-400 dark:hover:bg-white/10"
    >
      {copied ? "Copied" : `${id.slice(0, 8)}…`}
    </button>
  );
}

export default function AssignmentsPanel({ offering }: AssignmentsPanelProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<AssignmentFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Assignment | null>(null);
  const [pendingDone, setPendingDone] = useState<Assignment | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const loading = loadedFor !== offering.id || refreshing;

  // Async closure keeps setState off the synchronous effect path; `alive`
  // guards against a response landing after the teacher switches class.
  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const rows = await listAssignmentsByOffering(offering.id);
        if (!alive) return;
        setAssignments(rows);
        setListError(null);
      } catch (error) {
        if (alive) {
          setAssignments([]);
          setListError(errorMessage(error, "Could not load assignments."));
        }
      } finally {
        // Marks this offering resolved whether or not it succeeded, so a
        // failure does not spin forever.
        if (alive) setLoadedFor(offering.id);
      }
    })();

    return () => {
      alive = false;
    };
  }, [offering.id]);

  const reload = () => {
    setRefreshing(true);
    void listAssignmentsByOffering(offering.id)
      .then((rows) => {
        setAssignments(rows);
        setListError(null);
      })
      .catch((error) => setListError(errorMessage(error, "Could not load assignments.")))
      .finally(() => setRefreshing(false));
  };

  /**
   * When editing, the due date is only validated if the teacher changed it —
   * otherwise reopening an already-overdue assignment would be blocked on a
   * field they never touched, and the payload omits it anyway.
   */
  const dueDateChanged =
    !editing || form.due_date !== toLocalInputValue(new Date(editing.due_date));

  const duplicate = useMemo(
    () =>
      findDuplicate(
        assignments,
        { title: form.title, description: form.description },
        editing?.id,
      ),
    [assignments, form.title, form.description, editing],
  );

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
    setServerError(null);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setErrors({});
    setServerError(null);
    setFormOpen(true);
  };

  const openEdit = (assignment: Assignment) => {
    setEditing(assignment);
    setForm({
      title: assignment.title,
      description: assignment.description ?? "",
      assessment_type: assignment.assessment_type,
      due_date: toLocalInputValue(new Date(assignment.due_date)),
      total_points: String(Number(assignment.total_points)),
    });
    setErrors({});
    setServerError(null);
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    const nextErrors = validateAssignmentForm(form, { checkDueDate: dueDateChanged });
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    setSubmitting(true);
    setServerError(null);

    try {
      if (editing) {
        await updateAssignment(editing.id, {
          title: form.title,
          description: form.description,
          assessment_type: form.assessment_type,
          // Omitted when untouched, so the server never re-validates a past date.
          ...(dueDateChanged ? { due_date: toIsoDueDate(form.due_date) } : {}),
          total_points: Number(form.total_points),
        });
        setFeedback({
          variant: "success",
          title: "Assignment updated",
          message: `${form.title.trim()} was saved.`,
        });
      } else {
        const created = await createAssignment({
          offering_id: offering.id,
          title: form.title,
          description: form.description,
          assessment_type: form.assessment_type,
          due_date: toIsoDueDate(form.due_date),
          total_points: Number(form.total_points),
        });
        setFeedback({
          variant: "success",
          title: "Assignment published",
          message: `${created.title} is live, and enrolled students have been notified.`,
        });
      }

      setFormOpen(false);
      reload();
    } catch (error) {
      // 400 (past due date) and 409 (duplicate title + description) both land
      // here; the API's own message is the clearest thing to show.
      setServerError(
        errorMessage(error, "The server rejected this assignment."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = async () => {
    if (!pendingDone) return;
    setBusy(true);
    try {
      await markAssignmentDone(pendingDone.id);
      setFeedback({
        variant: "success",
        title: "Marked as done",
        message: `${pendingDone.title} is closed.`,
      });
      setPendingDone(null);
      reload();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not mark as done",
        message: errorMessage(error, "The server rejected the request."),
      });
      setPendingDone(null);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteAssignment(pendingDelete.id);
      setFeedback({
        variant: "success",
        title: "Assignment deleted",
        message: `${pendingDelete.title} was removed.`,
      });
      setPendingDelete(null);
      reload();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not delete this assignment",
        message: errorMessage(
          error,
          "Grades may already reference it — mark it done instead.",
        ),
      });
      setPendingDelete(null);
    } finally {
      setBusy(false);
    }
  };

  const openCount = assignments.filter((a) => !a.is_done).length;

  return (
    <div className="space-y-6">
      <FeedbackBanner feedback={feedback} />

      {formOpen && (
        <ComponentCard
          title={editing ? `Edit ${editing.title}` : "New assignment"}
          desc={`${offering.course_code} · Section ${offering.section}`}
        >
          {/* The server dispatches FCM on create as a side effect — there is no
              draft state, so the teacher must know before pressing publish. */}
          {!editing && (
            <div
              role="note"
              className="flex gap-3 rounded-xl border border-blue-light-300 bg-blue-light-50 px-4 py-3 dark:border-blue-light-800 dark:bg-blue-light-500/10"
            >
              <p className="text-sm text-blue-light-700 dark:text-blue-light-400">
                <strong>Publishing notifies students immediately.</strong> Every
                enrolled student receives a push notification as soon as this is
                created. There is no draft state, so double-check the title, due
                date and points before continuing.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormRow label="Title" htmlFor="a_title" required error={errors.title}>
              <Input
                id="a_title"
                placeholder="Linked List Lab"
                value={form.title}
                error={Boolean(errors.title)}
                onChange={(e) => setField("title", e.target.value)}
              />
            </FormRow>

            <FormRow label="Type" htmlFor="a_type" required>
              <Select
                id="a_type"
                value={form.assessment_type}
                options={ASSIGNMENT_TYPES.map((value) => ({
                  value,
                  label: TYPE_LABEL[value],
                }))}
                onChange={(value) => setField("assessment_type", value as AssignmentType)}
              />
            </FormRow>

            <FormRow
              label="Due date"
              htmlFor="a_due"
              required
              error={errors.due_date}
              hint="Local time. The server rejects dates in the past."
            >
              <Input
                id="a_due"
                type="datetime-local"
                value={form.due_date}
                error={Boolean(errors.due_date)}
                onChange={(e) => setField("due_date", e.target.value)}
              />
            </FormRow>

            <FormRow
              label="Total points"
              htmlFor="a_points"
              required
              error={errors.total_points}
              hint="Becomes the max score when this is graded."
            >
              <Input
                id="a_points"
                type="number"
                min="0"
                step={0.5}
                value={form.total_points}
                error={Boolean(errors.total_points)}
                onChange={(e) => setField("total_points", e.target.value)}
              />
            </FormRow>
          </div>

          <FormRow label="Instructions" htmlFor="a_description" hint="Optional.">
            <TextArea
              value={form.description}
              rows={4}
              placeholder="What students need to do, and how it will be marked."
              onChange={(value) => setField("description", value)}
            />
          </FormRow>

          {/* Local preview of the server's 409 rule. */}
          {duplicate && (
            <div className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 dark:border-error-800 dark:bg-error-500/10">
              <p className="text-sm text-error-600 dark:text-error-400">
                <strong>Duplicate.</strong> “{duplicate.title}” already exists on this
                offering with the same instructions. The server matches on title
                <em> and </em> description together, so changing either will clear this.
              </p>
            </div>
          )}

          {/* The server's actual rejection — 400 past due date, 409 duplicate,
              or anything else it decides to refuse. */}
          {serverError && !duplicate && (
            <div className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 dark:border-error-800 dark:bg-error-500/10">
              <p className="text-sm text-error-600 dark:text-error-400">{serverError}</p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || duplicate !== null}>
              {submitting
                ? editing
                  ? "Saving…"
                  : "Publishing…"
                : editing
                ? "Save changes"
                : "Publish assignment"}
            </Button>
          </div>
        </ComponentCard>
      )}

      <ComponentCard
        title="Assignments"
        desc={
          loading
            ? "Loading…"
            : `${assignments.length} total · ${openCount} open`
        }
      >
        {!formOpen && (
          <div className="flex justify-end">
            <Button size="sm" onClick={openCreate}>
              + New assignment
            </Button>
          </div>
        )}

        {listError && (
          <p className="rounded-lg border border-error-300 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
            {listError}
          </p>
        )}

        {loading && !listError && (
          <div className="space-y-3" aria-hidden="true">
            {[0, 1].map((row) => (
              <div
                key={row}
                className="h-16 w-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
              />
            ))}
          </div>
        )}

        {!loading && !listError && assignments.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            No assignments for this class yet.
          </p>
        )}

        <ul className="space-y-3">
          {assignments.map((assignment) => {
            const overdue = isOverdue(assignment);

            return (
              <li
                key={assignment.id}
                className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                        {assignment.title}
                      </h4>
                      <Badge size="sm" color="light">
                        {TYPE_LABEL[assignment.assessment_type] ?? assignment.assessment_type}
                      </Badge>
                      {assignment.is_done && (
                        <Badge size="sm" color="success">
                          Done
                        </Badge>
                      )}
                      {overdue && (
                        <Badge size="sm" color="warning">
                          Overdue
                        </Badge>
                      )}
                    </div>

                    {assignment.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                        {assignment.description}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span>
                        Due {new Date(assignment.due_date).toLocaleString()}
                      </span>
                      <span>{Number(assignment.total_points)} points</span>
                      <AssignmentId id={assignment.id} />
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(assignment)}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                    >
                      Edit
                    </button>
                    {!assignment.is_done && (
                      <button
                        type="button"
                        onClick={() => setPendingDone(assignment)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                      >
                        Mark done
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPendingDelete(assignment)}
                      className="rounded-lg border border-error-300 px-3 py-1.5 text-xs font-medium text-error-600 transition hover:bg-error-50 dark:border-error-800 dark:text-error-400 dark:hover:bg-error-500/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {assignments.length > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            The short code beside each assignment is its ID — click to copy. The
            Grades tab needs it to attach a mark to the right assignment.
          </p>
        )}
      </ComponentCard>

      <ConfirmDialog
        open={pendingDone !== null}
        busy={busy}
        title="Mark this assignment as done?"
        confirmLabel="Mark done"
        message={
          <>
            <p>
              <strong className="text-gray-800 dark:text-white/90">
                {pendingDone?.title}
              </strong>{" "}
              will be closed.
            </p>
            <p className="mt-2">
              <strong>This cannot be undone.</strong> The API has no endpoint to
              reopen an assignment — it would have to be deleted and recreated,
              which notifies students again.
            </p>
          </>
        }
        onConfirm={handleDone}
        onCancel={() => setPendingDone(null)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        destructive
        busy={busy}
        title="Delete this assignment?"
        confirmLabel="Delete assignment"
        message={
          <>
            <p>
              <strong className="text-gray-800 dark:text-white/90">
                {pendingDelete?.title}
              </strong>{" "}
              will be permanently removed.
            </p>
            <p className="mt-2">
              Any grades recorded against it reference this assignment, so the
              delete may be refused once marking has started. Mark it done
              instead if students have already been graded.
            </p>
          </>
        }
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
