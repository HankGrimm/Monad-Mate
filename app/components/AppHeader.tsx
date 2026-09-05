"use client";

import { useRouter } from "next/navigation";
import Icon from "./Icon";

/**
 * Fixed translucent top bar. `back` renders the history-back affordance used on
 * detail screens; omit it for tab roots.
 */
export default function AppHeader({
  title,
  subtitle,
  back = false,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <header className="fixed top-0 z-50 w-full max-w-[480px] pt-safe bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
      <div className="flex h-16 items-center justify-between px-gutter-mobile">
        <div className="flex min-w-0 items-center gap-space-xs">
          {back && (
            <button
              type="button"
              aria-label="Go back"
              onClick={() => router.back()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-all hover:text-primary active:scale-95"
            >
              <Icon name="arrow_back" size={24} />
            </button>
          )}
          <div className="flex min-w-0 items-center gap-space-xs">
            <BrandMark />
            <div className="flex min-w-0 flex-col">
              <h1 className="truncate text-label-md leading-none text-on-surface">
                {title}
              </h1>
              {subtitle && (
                <span className="mt-space-2xs truncate text-label-sm font-normal leading-none text-on-surface-variant">
                  {subtitle}
                </span>
              )}
            </div>
          </div>
        </div>
        {action && <div className="flex shrink-0 items-center">{action}</div>}
      </div>
    </header>
  );
}

/** Inline violet heart logo — no remote asset, so it can't break. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-label="MonadMate"
      role="img"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="brandmark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="50%" stopColor="#A855F7" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <path
        fill="url(#brandmark)"
        d="M32 50.5s-15.8-9.6-19.6-18.2C9.4 25.8 13 18.5 19.9 17.4c4.4-.7 8.5 1.5 10.6 5 .5.9 1.5 1.4 2.5 1.2.7-.1 1.3-.5 1.6-1.2 2.1-3.5 6.2-5.7 10.6-5 6.9 1.1 10.5 8.4 7.5 14.9C48.9 40.9 32 50.5 32 50.5Z"
      />
    </svg>
  );
}
