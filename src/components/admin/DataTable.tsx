import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
};

const cellBase = "px-5 py-4 text-sm text-gray-700 dark:text-gray-300";

/**
 * Read-only list rendering shared by the admin screens. Wide tables scroll
 * inside their own container so the page body never scrolls sideways.
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = null,
  emptyMessage = "Nothing here yet.",
}: DataTableProps<T>) {
  const message = loading
    ? "Loading…"
    : error
    ? error
    : rows.length === 0
    ? emptyMessage
    : null;

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
      <Table>
        <TableHeader className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.02]">
          <TableRow>
            {columns.map((column) => (
              <TableCell
                key={column.key}
                isHeader
                className={`px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 ${
                  column.className ?? ""
                }`}
              >
                {column.header}
              </TableCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
          {message ? (
            <TableRow>
              <TableCell
                className={`${cellBase} text-center ${
                  error ? "text-error-500" : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {/* colSpan isn't exposed by the shared TableCell, so a single
                    full-width cell stands in for the empty/loading state. */}
                <span className="block w-full">{message}</span>
              </TableCell>
              {columns.slice(1).map((column) => (
                <TableCell key={column.key} className={cellBase}>
                  {""}
                </TableCell>
              ))}
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={`${cellBase} ${column.className ?? ""}`}
                  >
                    {column.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
