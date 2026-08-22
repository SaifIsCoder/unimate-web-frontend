"use client";

import React, { useCallback, useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import FormRow from "@/components/admin/FormRow";
import FeedbackBanner, {
  errorMessage,
  type Feedback,
} from "@/components/admin/FeedbackBanner";
import DataTable, { type Column } from "@/components/admin/DataTable";
import {
  createEvent,
  deleteEvent,
  listEvents,
  updateEvent,
} from "@/services/communicationService";
import type { CampusEvent } from "@/types/academics";

type EventForm = {
  title: string;
  description: string;
  date: string;
  location: string;
};

const emptyForm = (): EventForm => ({
  title: "",
  description: "",
  date: "",
  location: "",
});

/** `datetime-local` needs "YYYY-MM-DDTHH:mm" in local time. */
const toLocalInputValue = (iso: string): string => {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

export default function EventsPage() {
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [meta, setMeta] = useState<any>(undefined);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof EventForm, string>>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const pageResult = await listEvents({ page, limit });
      setEvents(pageResult.data);
      setMeta(pageResult.meta);
      setListError(null);
    } catch (error) {
      setListError(errorMessage(error, "Could not load events."));
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  // Async closure keeps setState off the synchronous effect path; `alive`
  // guards against a response landing after unmount.
  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const pageResult = await listEvents({ page, limit });
        if (alive) {
          setEvents(pageResult.data);
          setMeta(pageResult.meta);
          setListError(null);
        }
      } catch (error) {
        if (alive) setListError(errorMessage(error, "Could not load events."));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [page, limit]);

  const setField = <K extends keyof EventForm>(key: K, value: EventForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
    setErrors({});
  };

  const startEdit = (event: CampusEvent) => {
    setEditingId(event.id);
    setForm({
      title: event.title,
      description: event.description ?? "",
      date: toLocalInputValue(event.date),
      location: event.location ?? "",
    });
    setFeedback(null);
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof EventForm, string>> = {};
    const title = form.title.trim();

    if (title.length < 2 || title.length > 160) next.title = "Title must be 2–160 characters.";
    if (!form.date) next.date = "Date and time are required.";
    else if (Number.isNaN(new Date(form.date).getTime())) next.date = "Enter a valid date and time.";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    setFeedback(null);
    if (!validate()) return;

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      // The input is local time; send an absolute instant so the server stores
      // the moment the admin actually picked.
      date: new Date(form.date).toISOString(),
      location: form.location.trim() || null,
    };

    setSubmitting(true);
    try {
      if (editingId) {
        await updateEvent(editingId, payload);
        setFeedback({
          variant: "success",
          title: "Event updated",
          message: `"${payload.title}" was saved.`,
        });
      } else {
        await createEvent(payload);
        setFeedback({
          variant: "success",
          title: "Event created",
          message: `"${payload.title}" was added to the calendar.`,
        });
      }
      resetForm();
      void refresh();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: editingId ? "Could not update event" : "Could not create event",
        message: errorMessage(error, "The server rejected the request."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (event: CampusEvent) => {
    setFeedback(null);
    setBusyId(event.id);
    try {
      await deleteEvent(event.id);
      if (editingId === event.id) resetForm();
      setFeedback({
        variant: "success",
        title: "Event deleted",
        message: `"${event.title}" was removed.`,
      });
      void refresh();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not delete event",
        message: errorMessage(error, "The server rejected the request."),
      });
    } finally {
      setBusyId(null);
    }
  };

  const columns: Column<CampusEvent>[] = [
    {
      key: "title",
      header: "Event",
      render: (row) => (
        <div className="max-w-sm">
          <p className="font-medium text-gray-800 dark:text-white/90">{row.title}</p>
          {row.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
              {row.description}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "date",
      header: "When",
      render: (row) => new Date(row.date).toLocaleString(),
    },
    { key: "location", header: "Where", render: (row) => row.location ?? "—" },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge size="sm" color={row.is_upcoming ? "success" : "light"}>
          {row.is_upcoming ? "Upcoming" : "Past"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busyId === row.id}
            onClick={() => handleDelete(row)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageBreadcrumb pageTitle="Events" />

      <div className="space-y-6">
        <ComponentCard
          title={editingId ? "Edit event" : "Create an event"}
          desc="Campus events surfaced to students in the mobile app. Reads are public; creating, editing and deleting are admin-only."
        >
          <FeedbackBanner feedback={feedback} />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormRow label="Title" htmlFor="title" required error={errors.title}>
              <Input
                id="title"
                placeholder="Spring Convocation"
                value={form.title}
                error={Boolean(errors.title)}
                onChange={(e) => setField("title", e.target.value)}
                maxLength={160}
                required
              />
            </FormRow>

            <FormRow label="Date and time" htmlFor="date" required error={errors.date}>
              <Input
                id="date"
                type="datetime-local"
                value={form.date}
                error={Boolean(errors.date)}
                onChange={(e) => setField("date", e.target.value)}
              />
            </FormRow>

            <FormRow label="Location" htmlFor="location">
              <Input
                id="location"
                placeholder="Main Auditorium"
                value={form.location}
                onChange={(e) => setField("location", e.target.value)}
                maxLength={160}
              />
            </FormRow>
          </div>

          <FormRow label="Description" htmlFor="description">
            <TextArea
              rows={4}
              placeholder="What is this event about?"
              value={form.description}
              onChange={(value) => setField("description", value)}
              maxLength={2000}
            />
          </FormRow>

          <div className="flex justify-end gap-3">
            {editingId && (
              <Button variant="outline" onClick={resetForm} disabled={submitting}>
                Cancel
              </Button>
            )}
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting
                ? editingId
                  ? "Saving…"
                  : "Creating…"
                : editingId
                ? "Save changes"
                : "Create event"}
            </Button>
          </div>
        </ComponentCard>

        <ComponentCard title="All events" desc={`${events.length} event(s)`}>
          <DataTable
            columns={columns}
            rows={events}
            rowKey={(row) => row.id}
            loading={loading}
            error={listError}
            emptyMessage="No events scheduled yet."
            pagination={meta}
            onPageChange={setPage}
          />
        </ComponentCard>
      </div>
    </div>
  );
}
