import Icon from "./Icon";

/** Full-bleed loading state for a screen that has nothing to show yet. */
export function ScreenLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-space-sm py-space-4xl text-on-surface-variant">
      <Icon name="progress_activity" size={32} className="animate-spin text-primary" />
      <span className="text-body-md">{label}</span>
    </div>
  );
}

/**
 * Empty state. Distinct from an error: this means the request succeeded and the
 * honest answer is "nothing here yet".
 */
export function EmptyState({
  icon = "radar",
  title,
  body,
  action,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-space-sm px-space-lg py-space-3xl text-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <span className="absolute h-20 w-20 rounded-full bg-primary-container/15 animate-ripple" />
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-primary">
          <Icon name={icon} size={28} />
        </span>
      </div>
      <h3 className="text-headline-sm text-on-surface">{title}</h3>
      {body && (
        <p className="max-w-[280px] text-body-md text-on-surface-variant">
          {body}
        </p>
      )}
      {action && <div className="mt-space-xs w-full max-w-[280px]">{action}</div>}
    </div>
  );
}

/** Inline error banner. Shows the server's message rather than a generic string. */
export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-start gap-space-xs rounded bg-error-container/25 border border-error/30 p-space-md text-error">
      <Icon name="error" size={20} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-body-md break-words">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-space-2xs text-label-md underline active:scale-95"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

/** Confirmation banner for successful actions. */
export function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-space-xs rounded bg-tertiary/15 border border-tertiary/30 p-space-md text-tertiary">
      <Icon name="check_circle" size={20} filled className="mt-0.5 shrink-0" />
      <p className="min-w-0 flex-1 text-body-md break-words text-on-surface">{message}</p>
    </div>
  );
}
