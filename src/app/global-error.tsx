"use client";

import React, { useEffect } from "react";

/**
 * Last-resort boundary.
 *
 * `app/error.tsx` renders *inside* the root layout, so it cannot catch a throw
 * from the root layout itself or from its providers (Theme, Auth, Sidebar).
 * This one replaces the entire document, which is why it must supply its own
 * <html> and <body>.
 *
 * Styling is inline on purpose: if the failure happened before or during the
 * layout render, the stylesheet may not have been applied.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Fatal application error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: "#f9fafb",
          color: "#1f2937",
        }}
      >
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>
            The dashboard failed to start
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 20px" }}>
            An unexpected error stopped the application from loading. Reloading
            usually clears it; if it persists, contact your administrator.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: 12,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                color: "#9ca3af",
                margin: "0 0 20px",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#465fff",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload dashboard
          </button>
        </main>
      </body>
    </html>
  );
}
