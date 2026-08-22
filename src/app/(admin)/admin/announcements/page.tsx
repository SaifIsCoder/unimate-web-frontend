"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Select from "@/components/form/Select";
import Radio from "@/components/form/input/Radio";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import FormRow from "@/components/admin/FormRow";
import FeedbackBanner, {
  errorMessage,
  type Feedback,
} from "@/components/admin/FeedbackBanner";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { listDepartments, listOfferings } from "@/services/academicService";
import { getMyAdminProfile, type AdminProfile } from "@/services/userService";
import {
  canEditAnnouncement,
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  markAnnouncementRead,
  updateAnnouncement,
  type BroadcastTarget,
} from "@/services/communicationService";
import { useAuth } from "@/context/AuthContext";
import type { Announcement, Department, Offering } from "@/types/academics";

type TargetKind = BroadcastTarget["kind"];

const TARGET_OPTIONS: { value: TargetKind; label: string; hint: string }[] = [
  {
    value: "department",
    label: "Department",
    hint: "Everyone in one department — students, teachers and admins.",
  },
  {
    value: "semester",
    label: "Semester",
    hint: "Every student enrolled in an offering for that semester.",
  },
  {
    value: "offerings",
    label: "Specific offerings",
    hint: "Only students enrolled in the offerings you pick.",
  },
];

export default function AnnouncementsPage() {
  // Needed for the author-only edit guard — `author_id` is a users.id, which is
  // exactly what AuthUser.id holds.
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [targetKind, setTargetKind] = useState<TargetKind>("department");
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [semester, setSemester] = useState("");
  const [offeringIds, setOfferingIds] = useState<string[]>([]);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [meta, setMeta] = useState<any>(undefined);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Announcement being edited, if any. Only ever set for the current author. */
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const pageResult = await listAnnouncements({ page, limit });
      setAnnouncements(pageResult.data);
      setMeta(pageResult.meta);
      setListError(null);
    } catch (error) {
      setListError(errorMessage(error, "Could not load announcements."));
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  // Async closure keeps setState off the synchronous effect path; `alive`
  // guards against a response landing after unmount.
  useEffect(() => {
    let alive = true;

    void (async () => {
      // All four are independent: the pickers degrade to empty, only the
      // announcement list surfaces an error.
      const [departmentResult, offeringResult, profileResult, listResult] =
        await Promise.allSettled([
          listDepartments(1, 100),
          listOfferings(1, 100),
          getMyAdminProfile(),
          listAnnouncements({ page, limit }),
        ]);

      if (!alive) return;

      setDepartments(departmentResult.status === "fulfilled" ? departmentResult.value.data : []);
      setOfferings(offeringResult.status === "fulfilled" ? offeringResult.value.data : []);

      // The server only accepts the admin's OWN department as a target, so the
      // picker is seeded from this rather than from the full department list.
      if (profileResult.status === "fulfilled") {
        setProfile(profileResult.value);
        if (profileResult.value.department_id !== null) {
          setDepartmentId(profileResult.value.department_id);
        }
      } else {
        setProfile(null);
      }

      if (listResult.status === "fulfilled") {
        setAnnouncements(listResult.value.data);
        setMeta(listResult.value.meta);
        setListError(null);
      } else {
        setListError(errorMessage(listResult.reason, "Could not load announcements."));
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [page, limit]);

  const semesters = useMemo(
    () => Array.from(new Set(offerings.map((offering) => offering.semester))).sort(),
    [offerings],
  );

  const departmentName = useCallback(
    (id: number | null) => departments.find((entry) => entry.id === id)?.name ?? null,
    [departments],
  );

  /** The one department this admin is allowed to broadcast to, if any. */
  const ownDepartment = useMemo(
    () =>
      profile?.department_id != null
        ? departments.find((entry) => entry.id === profile.department_id) ?? null
        : null,
    [departments, profile],
  );

  const buildTarget = (): BroadcastTarget | null => {
    if (targetKind === "department") {
      return departmentId === "" ? null : { kind: "department", department_id: departmentId };
    }
    if (targetKind === "semester") {
      return semester.trim() ? { kind: "semester", semester } : null;
    }
    return offeringIds.length > 0 ? { kind: "offerings", offering_ids: offeringIds } : null;
  };

  const toggleOffering = (id: string) => {
    setOfferingIds((previous) =>
      previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id],
    );
    setErrors((previous) => ({ ...previous, target: "" }));
  };

  const handleSubmit = async () => {
    setFeedback(null);
    const next: Record<string, string> = {};

    if (!title.trim()) next.title = "Title is required.";
    if (!content.trim()) next.content = "Message is required.";

    const target = buildTarget();
    if (!target) {
      next.target =
        targetKind === "department" && !ownDepartment
          ? "Your admin account has no department, so it cannot broadcast to one."
          : "Choose exactly one audience for this broadcast.";
    }

    setErrors(next);
    if (Object.keys(next).length > 0 || !target) return;

    setSubmitting(true);
    try {
      await createAnnouncement(title, content, target);
      setFeedback({
        variant: "success",
        title: "Announcement sent",
        message: "Recipients were resolved server-side and push notifications dispatched.",
      });
      setTitle("");
      setContent("");
      setOfferingIds([]);
      void refresh();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not send announcement",
        message: errorMessage(error, "The server rejected the request."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: Announcement) => {
    setFeedback(null);
    setBusyId(row.id);
    try {
      await deleteAnnouncement(row.id);
      setFeedback({
        variant: "success",
        title: "Announcement deleted",
        message: `"${row.title}" was removed.`,
      });
      void refresh();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not delete announcement",
        message: errorMessage(error, "The server rejected the request."),
      });
    } finally {
      setBusyId(null);
    }
  };

  /** Loads an announcement into the composer, which becomes an edit form. */
  const startEdit = (row: Announcement) => {
    setEditing(row);
    setTitle(row.title);
    setContent(row.content);
    setErrors({});
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditing(null);
    setTitle("");
    setContent("");
    setErrors({});
  };

  const handleUpdate = async () => {
    if (!editing) return;

    const nextErrors: Record<string, string> = {};
    if (!title.trim()) nextErrors.title = "Title is required.";
    if (!content.trim()) nextErrors.content = "Content is required.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusyId(editing.id);
    setFeedback(null);
    try {
      await updateAnnouncement(editing.id, { title, content });
      setFeedback({
        variant: "success",
        title: "Announcement updated",
        // The server re-dispatches FCM with an "Updated: " prefix on every edit.
        message: `"${title.trim()}" was saved. Everyone in its audience has been notified again.`,
      });
      cancelEdit();
      void refresh();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not update announcement",
        message: errorMessage(
          error,
          "Only the original author may edit an announcement.",
        ),
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkRead = async (row: Announcement) => {
    setBusyId(row.id);
    try {
      await markAnnouncementRead(row.id);
      void refresh();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not mark as read",
        message: errorMessage(error, "The server rejected the request."),
      });
    } finally {
      setBusyId(null);
    }
  };

  const columns: Column<Announcement>[] = [
    {
      key: "title",
      header: "Announcement",
      render: (row) => (
        <div className="max-w-md">
          <p className="font-medium text-gray-800 dark:text-white/90">{row.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
            {row.content}
          </p>
        </div>
      ),
    },
    {
      key: "target",
      header: "Audience",
      render: (row) => {
        if (row.department_id) {
          return (
            <Badge size="sm" color="info">
              {departmentName(row.department_id) ?? `Dept ${row.department_id}`}
            </Badge>
          );
        }
        if (row.semester) {
          return (
            <Badge size="sm" color="primary">
              {row.semester}
            </Badge>
          );
        }
        return (
          <Badge size="sm" color="light">
            Offerings
          </Badge>
        );
      },
    },
    {
      key: "created",
      header: "Sent",
      render: (row) => (
        <div>
          <p>{new Date(row.created_at).toLocaleString()}</p>
          {row.is_read === false && (
            <Badge size="sm" color="warning">
              Unread by you
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (row) => {
        /**
         * Edit is author-only. The server compares `author_id` against the
         * caller and 403s everyone else — including admins, who may delete
         * another author's announcement but never edit it. Hiding the button
         * outright is the honest representation; a disabled one would imply the
         * permission is merely unavailable right now.
         */
        const editable = canEditAnnouncement(row, user?.id);

        return (
          <div className="flex justify-end gap-2">
            {row.is_read === false && (
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === row.id}
                onClick={() => void handleMarkRead(row)}
              >
                Mark read
              </Button>
            )}
            {editable && (
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === row.id}
                onClick={() => startEdit(row)}
              >
                Edit
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={busyId === row.id}
              onClick={() => handleDelete(row)}
            >
              Delete
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageBreadcrumb pageTitle="Announcements" />

      <div className="space-y-6">
        <ComponentCard
          title={editing ? `Edit: ${editing.title}` : "Broadcast an announcement"}
          desc={
            editing
              ? "Only the title and content can be changed — the audience is fixed at creation. Saving re-notifies everyone who received it."
              : "Pick exactly one audience. The API accepts a department, a semester, or a set of offerings — never a combination."
          }
        >
          <FeedbackBanner feedback={feedback} />

          <FormRow label="Title" htmlFor="title" required error={errors.title}>
            <Input
              id="title"
              placeholder="Midterm schedule published"
              value={title}
              error={Boolean(errors.title)}
              onChange={(e) => {
                setTitle(e.target.value);
                setErrors((previous) => ({ ...previous, title: "" }));
              }}
            />
          </FormRow>

          <FormRow label="Message" htmlFor="content" required error={errors.content}>
            <TextArea
              rows={5}
              placeholder="Write the announcement body…"
              value={content}
              error={Boolean(errors.content)}
              onChange={(value) => {
                setContent(value);
                setErrors((previous) => ({ ...previous, content: "" }));
              }}
            />
          </FormRow>

          <div>
            <p className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-400">
              Audience<span className="ml-0.5 text-error-500">*</span>
            </p>
            <div className="flex flex-wrap gap-6">
              {TARGET_OPTIONS.map((option) => (
                <Radio
                  key={option.value}
                  id={`target-${option.value}`}
                  name="target"
                  value={option.value}
                  label={option.label}
                  checked={targetKind === option.value}
                  onChange={(value) => {
                    setTargetKind(value as TargetKind);
                    setErrors((previous) => ({ ...previous, target: "" }));
                  }}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {TARGET_OPTIONS.find((option) => option.value === targetKind)?.hint}
            </p>
          </div>

          {targetKind === "department" && (
            <FormRow
              label="Department"
              htmlFor="dept"
              required
              error={errors.target}
              hint={
                ownDepartment
                  ? "You can only broadcast to your own department."
                  : undefined
              }
            >
              {ownDepartment ? (
                <Select
                  id="dept"
                  disabled
                  value={String(ownDepartment.id)}
                  options={[
                    {
                      value: String(ownDepartment.id),
                      label: `${ownDepartment.code} — ${ownDepartment.name}`,
                    },
                  ]}
                  onChange={() => undefined}
                />
              ) : (
                <p className="rounded-lg border border-warning-500 bg-warning-50 p-3 text-sm text-warning-600 dark:border-warning-500/30 dark:bg-warning-500/15 dark:text-orange-400">
                  Your admin account isn&apos;t attached to a department, so the server will
                  reject a department broadcast. Target a semester or specific offerings
                  instead.
                </p>
              )}
            </FormRow>
          )}

          {targetKind === "semester" && (
            <FormRow
              label="Semester"
              htmlFor="semester"
              required
              error={errors.target}
              hint="Existing semesters are listed; type a new one if it isn't there yet."
            >
              {semesters.length > 0 ? (
                <Select
                  id="semester"
                  value={semester}
                  placeholder="Select a semester"
                  options={semesters.map((value) => ({ value, label: value }))}
                  onChange={(value) => {
                    setSemester(value);
                    setErrors((previous) => ({ ...previous, target: "" }));
                  }}
                />
              ) : (
                <Input
                  id="semester"
                  placeholder="Fall 2026"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                />
              )}
            </FormRow>
          )}

          {targetKind === "offerings" && (
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-400">
                Offerings<span className="ml-0.5 text-error-500">*</span>
              </p>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                {offerings.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No offerings available.
                  </p>
                ) : (
                  offerings.map((offering) => (
                    <label
                      key={offering.id}
                      className="flex cursor-pointer items-center gap-3 text-sm text-gray-700 dark:text-gray-300"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-brand-500 dark:border-gray-700"
                        checked={offeringIds.includes(offering.id)}
                        onChange={() => toggleOffering(offering.id)}
                      />
                      {offering.course_code} — {offering.semester} · Section {offering.section}
                    </label>
                  ))
                )}
              </div>
              {errors.target && <p className="mt-1.5 text-xs text-error-500">{errors.target}</p>}
            </div>
          )}

          <div className="flex justify-end gap-3">
            {editing && (
              <Button variant="outline" onClick={cancelEdit} disabled={busyId === editing.id}>
                Cancel
              </Button>
            )}
            <Button
              onClick={editing ? handleUpdate : handleSubmit}
              disabled={submitting || (editing !== null && busyId === editing.id)}
            >
              {editing
                ? busyId === editing.id
                  ? "Saving…"
                  : "Save changes"
                : submitting
                ? "Sending…"
                : "Send announcement"}
            </Button>
          </div>
        </ComponentCard>

        <ComponentCard title="Recent announcements" desc={`${announcements.length} announcement(s)`}>
          <DataTable
            columns={columns}
            rows={announcements}
            rowKey={(row) => row.id}
            loading={loading}
            error={listError}
            emptyMessage="Nothing has been broadcast yet."
            pagination={meta}
            onPageChange={setPage}
          />
        </ComponentCard>
      </div>
    </div>
  );
}
