/**
 * Session storage for the JWT issued by the backend.
 *
 * Stored in `localStorage` rather than a cookie because the app is a static
 * client talking to a separate API origin — there is no server-side session to
 * pair a cookie with. The trade-off is that XSS can read the token, so treat
 * any third-party script added to this app as able to impersonate the user.
 */
import type { User } from "./types";

const TOKEN_KEY = "monadmate.token";
const USER_KEY = "monadmate.user";

/** Notifies in-tab subscribers; `storage` events only fire across tabs. */
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    // Corrupted entry — drop it rather than crashing the app on boot.
    window.localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function setSession(token: string, user: User): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  notify();
}

export function updateUser(user: User): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  notify();
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  notify();
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

/** Verification tiers that satisfy the backend's meetup gate. */
const VERIFIED_LEVELS = ["phone", "id", "full"];

export function isVerified(user: User | null): boolean {
  return user !== null && VERIFIED_LEVELS.includes(user.verification_level);
}
