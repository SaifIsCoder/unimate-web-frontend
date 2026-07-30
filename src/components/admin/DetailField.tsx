import React from "react";

type DetailFieldProps = {
  label: string;
  value?: React.ReactNode;
  /** Shown when `value` is empty. Keeps "no data" distinct from "zero". */
  emptyText?: string;
};

/**
 * One label/value pair in a read-only detail grid.
 *
 * Renders an explicit placeholder rather than collapsing, so a missing field is
 * visibly missing instead of silently absent — which matters on people records
 * where a blank phone number and an unrendered one look identical otherwise.
 */
export default function DetailField({
  label,
  value,
  emptyText = "Not set",
}: DetailFieldProps) {
  const isEmpty = value === null || value === undefined || value === "";

  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gray-800 dark:text-white/90">
        {isEmpty ? (
          <span className="text-gray-400 dark:text-gray-500">{emptyText}</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
