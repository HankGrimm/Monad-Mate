"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, isAuthenticated, subscribe } from "@/lib/auth";
import type { User } from "@/lib/types";
import { ScreenLoader } from "./States";

/**
 * Client-side gate for authenticated screens.
 *
 * This is a UX guard, not a security boundary — the backend authorises every
 * request independently. It exists so an unauthenticated visitor lands on
 * sign-in instead of a screen full of failed fetches.
 */
export default function RequireAuth({
  children,
}: {
  children: (user: User) => React.ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<{ ready: boolean; user: User | null }>({
    ready: false,
    user: null,
  });

  useEffect(() => {
    const sync = () => {
      if (!isAuthenticated()) {
        router.replace("/signin");
        setState({ ready: false, user: null });
        return;
      }
      setState({ ready: true, user: getUser() });
    };
    sync();
    return subscribe(sync);
  }, [router]);

  if (!state.ready || !state.user) {
    return <ScreenLoader label="Checking your session" />;
  }

  return <>{children(state.user)}</>;
}
