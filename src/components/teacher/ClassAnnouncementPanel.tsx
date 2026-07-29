"use client";

import React, { useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Checkbox from "@/components/form/input/Checkbox";
import Button from "@/components/ui/button/Button";
import FormRow from "@/components/admin/FormRow";
import FeedbackBanner, {
  errorMessage,
  type Feedback,
} from "@/components/admin/FeedbackBanner";
import { createAnnouncement } from "@/services/communicationService";
import type { TeachingOffering } from "@/types/academics";

type ClassAnnouncementPanelProps = {
  offering: TeachingOffering;
  /** The teacher's other classes, so one notice can span several sections. */
  allOfferings: TeachingOffering[];
};

/**
 * Teachers may only target `offering_ids[]`, and only offerings they own — the
 * server rejects a department or semester target from a teacher outright, and
 * verifies ownership of every id in the array.
 */
export default function ClassAnnouncementPanel({
  offering,
  allOfferings,
}: ClassAnnouncementPanelProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selected, setSelected] = useState<string[]>([offering.id]);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const others = useMemo(
    () => allOfferings.filter((entry) => entry.id !== offering.id),
    [allOfferings, offering.id],
  );

  const toggle = (id: string) => {
    setSelected((previous) =>
      previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id],
    );
    setErrors((previous) => ({ ...previous, targets: "" }));
  };

  const handleSubmit = async () => {
    setFeedback(null);
    const next: Record<string, string> = {};

    if (!title.trim()) next.title = "Title is required.";
    if (!content.trim()) next.content = "Message is required.";
    if (selected.length === 0) next.targets = "Select at least one class.";

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      await createAnnouncement(title, content, {
        kind: "offerings",
        offering_ids: selected,
      });
      setFeedback({
        variant: "success",
        title: "Announcement sent",
        message: `Delivered to students enrolled in ${selected.length} class(es). Push notifications were dispatched server-side.`,
      });
      setTitle("");
      setContent("");
      setSelected([offering.id]);
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

  return (
    <ComponentCard
      title="Announce to this class"
      desc="Reaches only students enrolled in the classes you select. Teachers can't broadcast to a whole department or semester."
    >
      <FeedbackBanner feedback={feedback} />

      <FormRow label="Title" htmlFor="ann_title" required error={errors.title}>
        <Input
          id="ann_title"
          placeholder="Quiz moved to Friday"
          value={title}
          error={Boolean(errors.title)}
          onChange={(e) => {
            setTitle(e.target.value);
            setErrors((previous) => ({ ...previous, title: "" }));
          }}
        />
      </FormRow>

      <FormRow label="Message" htmlFor="ann_content" required error={errors.content}>
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
        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-400">
          Classes<span className="ml-0.5 text-error-500">*</span>
        </p>
        <div className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <Checkbox
            label={`${offering.course_code} · Section ${offering.section} (this class)`}
            checked={selected.includes(offering.id)}
            onChange={() => toggle(offering.id)}
          />
          {others.map((entry) => (
            <Checkbox
              key={entry.id}
              label={`${entry.course_code} · Section ${entry.section} — ${entry.semester}`}
              checked={selected.includes(entry.id)}
              onChange={() => toggle(entry.id)}
            />
          ))}
        </div>
        {errors.targets ? (
          <p className="mt-1.5 text-xs text-error-500">{errors.targets}</p>
        ) : (
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Only classes you teach are listed — the server verifies ownership of every id.
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Sending…" : "Send announcement"}
        </Button>
      </div>
    </ComponentCard>
  );
}
