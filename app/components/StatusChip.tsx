import Icon from "./Icon";

type Tone = "neutral" | "verified" | "brand" | "hot" | "warn";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-container-high text-on-surface-variant",
  verified: "bg-tertiary/15 border border-tertiary/30 text-tertiary",
  brand: "bg-primary-container/20 border border-primary-container/40 text-primary",
  hot: "bg-secondary-container/25 border border-secondary/30 text-secondary",
  warn: "bg-error-container/25 border border-error/30 text-error",
};

/** Small status pill. `pulse` adds the live indicator dot from DESIGN.md. */
export default function StatusChip({
  children,
  tone = "neutral",
  icon,
  pulse = false,
  className = "",
}: {
  children: React.ReactNode;
  tone?: Tone;
  icon?: string;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-space-2xs px-space-sm py-space-2xs rounded-full text-label-status uppercase ${TONES[tone]} ${className}`}
    >
      {pulse && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
        </span>
      )}
      {icon && <Icon name={icon} size={14} filled />}
      {children}
    </span>
  );
}
