"use client";

import React, { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import Button from "@/components/ui/button/Button";
import FormRow from "@/components/admin/FormRow";
import FeedbackBanner, {
  errorMessage,
  type Feedback,
} from "@/components/admin/FeedbackBanner";
import TranscriptView from "@/components/admin/TranscriptView";
import { getStudent, listStudents } from "@/services/directoryService";
import { getStudentTranscript } from "@/services/gradeService";
import type { Student, StudentDetail, Transcript } from "@/types/academics";

export default function TranscriptsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [studentId, setStudentId] = useState("");

  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const rows = await listStudents();
        if (!alive) return;
        setStudents(rows);
        setStudentsError(null);
      } catch (error) {
        if (alive) setStudentsError(errorMessage(error, "Could not load students."));
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = needle
      ? students.filter((student) =>
          [student.roll_number, student.email]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(needle)),
        )
      : students;

    // A native select with thousands of options is unusable; the search box is
    // the primary way in, and this caps the rendered list.
    return pool.slice(0, 100);
  }, [students, query]);

  const load = async (id: string) => {
    if (!id) return;

    setLoading(true);
    setFeedback(null);

    // The profile is context for the header; a failure there should not block
    // the transcript itself.
    const [transcriptResult, detailResult] = await Promise.allSettled([
      getStudentTranscript(id),
      getStudent(id),
    ]);

    if (transcriptResult.status === "fulfilled") {
      setTranscript(transcriptResult.value);
    } else {
      setTranscript(null);
      setFeedback({
        variant: "error",
        title: "Could not load this transcript",
        message: errorMessage(
          transcriptResult.reason,
          "Transcripts are admin-only; teachers receive a 403.",
        ),
      });
    }

    setDetail(detailResult.status === "fulfilled" ? detailResult.value : null);
    setLoading(false);
  };

  return (
    <div>
      <PageBreadcrumb pageTitle="Transcripts" />

      <div className="space-y-6">
        {/* print:hidden keeps the picker out of the exported document. */}
        <div className="print:hidden">
          <ComponentCard
            title="Select a student"
            desc="Transcripts are computed live from current grades and offering weights."
          >
            <FeedbackBanner feedback={feedback} />

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <FormRow label="Search" htmlFor="t_search" hint="Roll number or email.">
                <Input
                  id="t_search"
                  placeholder="FA21-BCS"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </FormRow>

              <FormRow
                label="Student"
                htmlFor="t_student"
                required
                error={studentsError ?? undefined}
                hint={
                  students.length > matches.length
                    ? `Showing ${matches.length} of ${students.length} — refine the search.`
                    : undefined
                }
              >
                <Select
                  id="t_student"
                  value={studentId}
                  placeholder={students.length ? "Select a student" : "No students found"}
                  options={matches.map((student) => ({
                    value: student.id,
                    label: `${student.roll_number} — ${student.email}`,
                  }))}
                  onChange={(value) => {
                    setStudentId(value);
                    void load(value);
                  }}
                />
              </FormRow>
            </div>
          </ComponentCard>
        </div>

        {loading && (
          <div className="h-48 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
        )}

        {!loading && transcript && (
          <>
            <div className="flex justify-end gap-3 print:hidden">
              <Button variant="outline" onClick={() => void load(studentId)}>
                Refresh
              </Button>
              <Button onClick={() => window.print()}>Export PDF</Button>
            </div>

            <TranscriptView student={detail} transcript={transcript} />

            <p className="text-xs text-gray-500 dark:text-gray-400 print:hidden">
              Export opens your browser&apos;s print dialog — choose <strong>Save as
              PDF</strong> as the destination. This keeps the text selectable and
              respects your paper size, which a screenshot-based export would not.
            </p>
          </>
        )}

        {!loading && !transcript && !feedback && (
          <ComponentCard title="No transcript loaded">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Pick a student above to generate their transcript.
            </p>
          </ComponentCard>
        )}
      </div>
    </div>
  );
}
