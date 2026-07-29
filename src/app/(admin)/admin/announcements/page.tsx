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
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  type BroadcastTarget,
} from "@/services/communicationService";
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
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const page = await listAnnouncements();
      setAnnouncements(page.data);
      setListError(null);
    } catch (error) {
      setListError(errorMessage(error, "Could not load announcements."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    listDepartments()
      .then(setDepartments)
      .catch(() => setDepartments([]));
    listOfferings()
      .then(setOfferings)
      .catch(() => setOfferings([]));
    // The server only accepts the admin's OWN department as a target, so the
    // picker is seeded from this rather than from the full department list.
    getMyAdminProfile()
      .then((loaded) => {
        setProfile(loaded);
        if (loaded.department_id !== null) setDepartmentId(loaded.department_id);
      })
      .catch(() => setProfile(null));
    void refresh();
  }, [refresh]);

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
      render: (row) => new Date(row.created_at).toLocaleString(),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Button
          size="sm"
          variant="outline"
          disabled={busyId === row.id}
          onClick={() => handleDelete(row)}
        >
          Delete
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageBreadcrumb pageTitle="Announcements" />

      <div className="space-y-6">
        <ComponentCard
          title="Broadcast an announcement"
          desc="Pick exactly one audience. The API accepts a department, a semester, or a set of offerings — never a combination."
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

          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Sending…" : "Send announcement"}
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
          />
        </ComponentCard>
      </div>
    </div>
  );
}
