"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";

const TABS = [
  { href: "/", label: "Home", icon: "explore" },
  { href: "/requests", label: "Requests", icon: "forum" },
  { href: "/credentials", label: "Badges", icon: "verified" },
  { href: "/profile", label: "Profile", icon: "person" },
];

/** Floating glass tab bar, 16px above the safe-area inset per DESIGN.md. */
export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="pointer-events-none fixed bottom-0 z-50 w-full max-w-[480px] pb-safe">
      <div className="px-gutter-mobile pb-space-sm">
        <div className="pointer-events-auto flex h-16 items-center justify-around rounded-lg bg-surface-container/85 px-space-xs shadow-float backdrop-blur-xl">
          {TABS.map((tab) => {
            const active =
              tab.href === "/"
                ? pathname === "/"
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-14 w-14 flex-col items-center justify-center transition-all active:scale-95 ${
                  active
                    ? "font-bold text-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <Icon name={tab.icon} size={24} filled={active} />
                <span className="mt-0.5 text-label-sm">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
