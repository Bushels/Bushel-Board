// components/dashboard/seeding-canada-placeholder.tsx
// Amber banner explaining the v1 US-only scope.

export function SeedingCanadaPlaceholder() {
  return (
    <div
      className="flex items-start gap-3 rounded-2xl border border-amber-300/40 bg-amber-50/60 p-4 text-sm"
      role="note"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 22 22"
        aria-hidden="true"
        className="mt-0.5 shrink-0"
      >
        <path fill="#d97706" d="M11 2 21 19H1L11 2Z" />
        <rect x="10" y="8" width="2" height="6" fill="#fff7e8" />
        <rect x="10" y="16" width="2" height="2" fill="#fff7e8" />
      </svg>
      <div>
        <strong className="font-semibold text-foreground">
          Canada seeding layer coming mid-May.
        </strong>
        <p className="mt-1 text-muted-foreground">
          US grain belt shown first. Provincial seeding data is not in the
          database yet — AB / SK / MB will appear here as crop reports release.
        </p>
      </div>
    </div>
  );
}
