"use client";

import React, { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary.
 *
 * Catches render and data-fetch throws anywhere below the root layout. Without
 * it, an uncaught error drops the user on Next's unstyled default screen with
 * no way back.
 *
 * The layout (and therefore the sidebar and header) stays mounted around this,
 * so navigation remains available while the failed segment is replaced.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with the real reporter when observability lands.
    console.error("Unhandled UI error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error-50 dark:bg-error-500/10">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            className="text-error-500"
            aria-hidden="true"
          >
            <path
              d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          This screen failed to load. Your session is still active — retrying
          usually resolves it.
        </p>

        {/*
          `digest` is the only error detail Next exposes in production; the
          message itself is stripped server-side. Showing it gives users
          something concrete to quote in a bug report.
        */}
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-gray-400 dark:text-gray-500">
            Reference: {error.digest}
          </p>
        )}

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
