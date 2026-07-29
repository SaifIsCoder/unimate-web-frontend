"use client";

import React from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Badge from "@/components/ui/badge/Badge";
import DataTable, { type Column } from "@/components/admin/DataTable";
import type { Enrollment } from "@/types/academics";

type RosterPanelProps = {
  roster: Enrollment[];
  loading: boolean;
  error: string | null;
};

/**
 * The roster is the spine of the teacher portal: attendance and grading both
 * need the `student_id` values it supplies.
 */
export default function RosterPanel({ roster, loading, error }: RosterPanelProps) {
  const columns: Column<Enrollment>[] = [
    { key: "roll", header: "Roll number", render: (row) => row.roll_number },
    { key: "email", header: "Email", render: (row) => row.student_email },
    { key: "batch", header: "Batch", render: (row) => row.batch ?? "—" },
    {
      key: "department",
      header: "Department",
      render: (row) => row.department_name ?? "—",
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge size="sm" color={row.status === "enrolled" ? "success" : "light"}>
          {row.status}
        </Badge>
      ),
    },
  ];

  const active = roster.filter((row) => row.status === "enrolled").length;

  return (
    <ComponentCard
      title="Roster"
      desc={
        loading
          ? "Loading…"
          : `${active} actively enrolled of ${roster.length} record(s). Only admins can add or remove students.`
      }
    >
      <DataTable
        columns={columns}
        rows={roster}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        emptyMessage="No students are enrolled in this class yet."
      />
    </ComponentCard>
  );
}
