"use client";

import Icon from "./Icon";

type Props = {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  className?: string;
};

/**
 * Primary CTA — the "Vivid Gradient" pill from DESIGN.md: 52px tall, full pill,
 * violet→pink gradient with a beacon glow.
 */
export function GradientButton({
  children,
  onClick,
  type = "button",
  disabled = false,
  loading = false,
  icon,
  className = "",
}: Props) {
  const inert = disabled || loading;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={inert}
      className={`w-full h-[52px] rounded-full bg-gradient-to-r from-primary-container via-inverse-primary to-secondary-container text-white text-label-lg flex items-center justify-center gap-space-xs shadow-beacon transition-all duration-150 active:scale-[0.98] ${
        inert ? "opacity-50 pointer-events-none" : ""
      } ${className}`}
    >
      {loading ? (
        <Icon name="progress_activity" size={20} className="animate-spin" />
      ) : (
        <>
          {icon && <Icon name={icon} size={20} />}
          <span>{children}</span>
        </>
      )}
    </button>
  );
}

/** Secondary / glass button — translucent fill with a hairline border, 48px. */
export function GlassButton({
  children,
  onClick,
  type = "button",
  disabled = false,
  loading = false,
  icon,
  className = "",
}: Props) {
  const inert = disabled || loading;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={inert}
      className={`h-12 px-space-xl rounded-full bg-white/5 border border-white/[0.12] text-on-surface text-label-lg flex items-center justify-center gap-space-xs transition-all active:scale-95 active:bg-white/10 ${
        inert ? "opacity-50 pointer-events-none" : ""
      } ${className}`}
    >
      {loading ? (
        <Icon name="progress_activity" size={20} className="animate-spin" />
      ) : (
        <>
          {icon && <Icon name={icon} size={20} />}
          <span>{children}</span>
        </>
      )}
    </button>
  );
}

/** Ghost / tertiary — text only, muted until interaction. */
export function GhostButton({
  children,
  onClick,
  type = "button",
  disabled = false,
  icon,
  className = "",
}: Props) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-space-2xs px-space-md py-space-xs text-on-surface-variant hover:text-on-surface text-label-md transition-colors active:scale-95 ${
        disabled ? "opacity-50 pointer-events-none" : ""
      } ${className}`}
    >
      {icon && <Icon name={icon} size={18} />}
      <span>{children}</span>
    </button>
  );
}
