/**
 * Route-level loading fallback.
 *
 * Shown while a segment's code or data is in flight. Deliberately minimal — the
 * layout chrome is already on screen around it, so a full-page skeleton would
 * flash more than it reassures.
 */
export default function Loading() {
  return (
    <div
      className="flex min-h-[40vh] w-full items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
