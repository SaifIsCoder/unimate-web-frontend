import React from "react";
import Label from "@/components/form/Label";

type FormRowProps = {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
};

/** Label + control + hint/error, so every admin form lines up identically. */
export default function FormRow({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  children,
  className = "",
}: FormRowProps) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-error-500">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-error-500">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}
