"use client";

import React from "react";
import Badge from "@/components/ui/badge/Badge";
import { gradeTone } from "@/lib/gradebook";
import type { StudentDetail, Transcript, TranscriptCourse } from "@/types/academics";

type TranscriptViewProps = {
  student: StudentDetail | null;
  transcript: Transcript;
};

/** Groups courses by semester, preserving the order they arrive in. */
const bySemester = (courses: TranscriptCourse[]): [string, TranscriptCourse[]][] => {
  const groups = new Map<string, TranscriptCourse[]>();

  for (const course of courses) {
    const key = course.semester || "Unspecified";
    groups.set(key, [...(groups.get(key) ?? []), course]);
  }

  return [...groups.entries()];
};

const semesterGpa = (courses: TranscriptCourse[]): number => {
  const credits = courses.reduce((sum, course) => sum + Number(course.credit_hours), 0);
  if (credits === 0) return 0;
  const points = courses.reduce((sum, course) => sum + Number(course.quality_points), 0);
  return points / credits;
};

/**
 * Printable academic transcript.
 *
 * Export is `window.print()` against a print stylesheet rather than jsPDF or
 * html2canvas. For a document that is a table of text, that is both the
 * cleanest and the highest-fidelity option: it produces real selectable text
 * and honours the user's paper size, whereas html2canvas would rasterise the
 * page into a blurry image and jsPDF would mean re-implementing this layout a
 * second time in a different API — two layouts to keep in sync forever.
 *
 * The browser's "Save as PDF" destination covers the PDF requirement with no
 * dependency at all.
 */
export default function TranscriptView({ student, transcript }: TranscriptViewProps) {
  const groups = bySemester(transcript.courses);

  return (
    <div
      id="transcript-document"
      className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03] print:rounded-none print:border-0 print:bg-white print:p-0"
    >
      {/* Print-only masthead — on screen the page already has a heading. */}
      <div className="hidden print:mb-6 print:block">
        <h1 className="text-xl font-bold text-black">UniMate — Academic Transcript</h1>
        <p className="text-xs text-gray-700">
          Generated {new Date().toLocaleString()}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 border-b border-gray-200 pb-4 sm:grid-cols-4 dark:border-gray-800 print:border-gray-400">
        <Field label="Student" value={student?.roll_number ?? "—"} />
        <Field label="Email" value={student?.email ?? "—"} />
        <Field label="Credit hours" value={String(transcript.total_credit_hours)} />
        <Field label="CGPA" value={transcript.cgpa.toFixed(2)} emphasis />
      </div>

      {transcript.courses.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          No graded courses. Only actively enrolled offerings appear on a transcript.
        </p>
      ) : (
        groups.map(([semester, courses]) => (
          <section key={semester} className="mb-6 break-inside-avoid">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90 print:text-black">
                {semester}
              </h3>
              <span className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-700">
                SGPA {semesterGpa(courses).toFixed(2)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400 print:border-gray-400 print:text-black">
                    <th className="py-2 font-medium">Code</th>
                    <th className="py-2 font-medium">Course</th>
                    <th className="py-2 text-right font-medium">Credits</th>
                    <th className="py-2 text-right font-medium">Marks</th>
                    <th className="py-2 text-right font-medium">Grade</th>
                    <th className="py-2 text-right font-medium">GP</th>
                    <th className="py-2 text-right font-medium">QP</th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((course) => (
                    <tr
                      key={course.offering_id}
                      className="border-b border-gray-100 last:border-0 dark:border-gray-800 print:border-gray-300"
                    >
                      <td className="py-2 font-medium text-gray-800 dark:text-white/90 print:text-black">
                        {course.course_code}
                      </td>
                      <td className="py-2 text-gray-700 dark:text-gray-300 print:text-black">
                        {course.course}
                      </td>
                      <td className="py-2 text-right text-gray-700 dark:text-gray-300 print:text-black">
                        {course.credit_hours}
                      </td>
                      <td className="py-2 text-right text-gray-700 dark:text-gray-300 print:text-black">
                        {course.final_marks}
                      </td>
                      <td className="py-2 text-right">
                        {/* Badges lose their colour in print, so the letter is
                            also rendered as plain text for the printed copy. */}
                        <span className="print:hidden">
                          <Badge size="sm" color={gradeTone(course.letter_grade)}>
                            {course.letter_grade}
                          </Badge>
                        </span>
                        <span className="hidden font-medium text-black print:inline">
                          {course.letter_grade}
                        </span>
                      </td>
                      <td className="py-2 text-right text-gray-700 dark:text-gray-300 print:text-black">
                        {Number(course.grade_point).toFixed(2)}
                      </td>
                      <td className="py-2 text-right text-gray-700 dark:text-gray-300 print:text-black">
                        {Number(course.quality_points).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      <div className="mt-6 border-t border-gray-200 pt-4 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400 print:border-gray-400 print:text-gray-700">
        <p>
          Grade points follow the UOS scale. Quality points are grade point ×
          credit hours; CGPA is total quality points ÷ total credit hours.
        </p>
        <p className="mt-1">
          Computed live from current assessment weights — this is not a sealed
          record, and it will change if grades or offering weights are edited.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 print:text-gray-700">
        {label}
      </p>
      <p
        className={`mt-1 text-gray-800 dark:text-white/90 print:text-black ${
          emphasis ? "text-lg font-bold" : "text-sm font-medium"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
