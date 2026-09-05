/**
 * Surface containers matching the elevation tiers in DESIGN.md.
 *
 * `glow` adds the ambient violet/pink blur orbs that appear on most cards in the
 * export; they are decorative and pointer-events-none.
 */
export default function Card({
  children,
  glow = false,
  className = "",
}: {
  children: React.ReactNode;
  glow?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-surface-container p-space-lg shadow-float ${className}`}
    >
      {glow && (
        <>
          <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary-container/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-secondary-container/20 blur-2xl" />
        </>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

/** Recessed inner row used for detail lists inside a Card. */
export function CardRow({
  icon,
  iconTone = "text-primary",
  label,
  value,
  hint,
  children,
}: {
  icon: React.ReactNode;
  iconTone?: string;
  label: string;
  value: string;
  hint?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-space-sm rounded bg-surface-container-low p-space-sm">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container-high ${iconTone}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <span className="block text-label-sm text-on-surface-variant">
          {label}
        </span>
        <span className="block truncate text-label-lg text-on-surface">
          {value}
        </span>
        {hint && <span className="block text-body-sm">{hint}</span>}
        {children}
      </div>
    </div>
  );
}
