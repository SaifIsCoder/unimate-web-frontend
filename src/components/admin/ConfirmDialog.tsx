"use client";

import React, { useEffect, useRef } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  /** What will happen, in plain terms. Say the consequence, not "are you sure?". */
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red styling for irreversible actions. */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Confirmation gate for destructive actions.
 *
 * Every delete in the admin console is a hard delete server-side, so this is
 * the only thing standing between a stray click and a lost row.
 *
 * Accessibility: renders as a modal dialog, moves focus to the cancel button on
 * open (the safe default, so Enter does not confirm), traps Escape, and restores
 * focus to whatever opened it.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-99999 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className="absolute inset-0 bg-gray-900/50 backdrop-blur-[2px]"
        onClick={() => !busy && onCancel()}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900">
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold text-gray-800 dark:text-white/90"
        >
          {title}
        </h2>

        <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">{message}</div>

        <div className="mt-6 flex justify-end gap-3">
          {/*
            Native buttons rather than the shared <Button>: this dialog needs a
            ref on cancel to manage focus, and that component does not forward
            one. Classes mirror its outline/primary variants.
          */}
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
              destructive
                ? "bg-error-500 hover:bg-error-600"
                : "bg-brand-500 hover:bg-brand-600"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
