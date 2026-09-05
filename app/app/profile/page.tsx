"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import Avatar from "@/components/Avatar";
import BottomNav from "@/components/BottomNav";
import { GhostButton } from "@/components/Button";
import Icon from "@/components/Icon";
import RequireAuth from "@/components/RequireAuth";
import StatusChip from "@/components/StatusChip";
import { ErrorBanner } from "@/components/States";
import { api, ApiError } from "@/lib/api";
import { clearSession, updateUser } from "@/lib/auth";
import { formatDate, sceneIcon, sceneLabel, shortAddress } from "@/lib/format";
import type {
  Credit,
  FulfilmentCredential,
  Gender,
  User,
  WalletAccountInfo,
} from "@/lib/types";

export default function ProfilePage() {
  return <RequireAuth>{(user) => <Profile user={user} />}</RequireAuth>;
}

function Profile({ user }: { user: User }) {
  const router = useRouter();
  const [credit, setCredit] = useState<Credit | null>(null);
  const [credentials, setCredentials] = useState<FulfilmentCredential[]>([]);
  const [wallet, setWallet] = useState<WalletAccountInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [genderOpen, setGenderOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [creditRes, credentialRes, walletRes] = await Promise.all([
        api.credentials.credit(),
        api.credentials.listMine(10),
        api.auth.accountInfo(),
      ]);
      setCredit(creditRes);
      setCredentials(credentialRes.items);
      setWallet(walletRes);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load your profile.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setGender(gender: Gender) {
    setError(null);
    try {
      const updated = await api.users.update({ gender });
      updateUser(updated);
      setGenderOpen(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not update your profile.",
      );
    }
  }

  function signOut() {
    clearSession();
    router.replace("/signin");
  }

  const displayName = wallet?.managed
    ? "Your account"
    : shortAddress(user.wallet_address);

  return (
    <>
      <AppHeader
        title="MonadMate"
        subtitle="Profile"
        action={<Avatar name={displayName} seed={user.id} size={32} />}
      />

      <main className="flex flex-1 flex-col gap-space-xl px-gutter-mobile pb-28 pt-20">
        {error && <ErrorBanner message={error} onRetry={load} />}

        {/* Identity hero */}
        <div className="relative overflow-hidden rounded-lg bg-surface-container p-space-lg shadow-float">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary-container/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-secondary-container/20 blur-2xl" />

          <div className="relative flex flex-col items-center text-center">
            <Avatar
              name={displayName}
              seed={user.id}
              size={96}
              ring="brand"
              badge={
                ["phone", "id", "full"].includes(user.verification_level)
                  ? "verified"
                  : undefined
              }
            />
            <h2 className="mt-space-sm text-headline-md text-on-surface">
              {displayName}
            </h2>
            <span className="mb-space-xs mt-0.5 font-mono text-body-sm text-on-surface-variant">
              {shortAddress(user.wallet_address)}
            </span>

            {["phone", "id", "full"].includes(user.verification_level) ? (
              <StatusChip tone="verified" icon="verified">
                Identity verified
              </StatusChip>
            ) : (
              <Link
                href="/verification"
                className="inline-flex items-center gap-space-2xs rounded-full bg-secondary-container/25 border border-secondary/30 px-space-sm py-space-2xs text-label-status uppercase text-secondary transition-all active:scale-95"
              >
                <Icon name="badge" size={14} filled />
                Not verified — tap to verify
              </Link>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-col gap-space-sm rounded-lg bg-surface-container p-space-md shadow-float">
          <div className="grid grid-cols-2 gap-space-sm">
            <Stat
              icon="local_fire_department"
              tone="text-secondary"
              bg="bg-secondary-container/20"
              value={`${credit?.fulfilled_count ?? 0} kept`}
              label="Meetups"
            />
            <div className="flex flex-col items-center justify-center rounded bg-surface-container-low p-space-md text-center">
              <span className="mb-space-2xs flex h-10 w-10 items-center justify-center rounded-full bg-primary-container/20 text-primary">
                <Icon name="auto_awesome" size={22} />
              </span>
              {credit?.score_available && credit.credit_score !== null ? (
                <span className="bg-gradient-to-r from-primary via-secondary to-tertiary bg-clip-text text-display-hero-mobile leading-tight text-transparent">
                  {Math.round(credit.credit_score)}
                </span>
              ) : (
                <span className="text-headline-sm text-on-surface-variant">
                  —
                </span>
              )}
              <span className="mt-0.5 text-label-sm text-on-surface-variant">
                Credit
              </span>
            </div>
          </div>

          {/* The disclaimer text comes from the backend so client and server
              can never disagree about what credit means. */}
          <div className="flex items-start gap-1.5 px-space-xs pt-space-2xs">
            <Icon name="info" size={15} className="mt-0.5 shrink-0 text-outline" />
            <p className="text-body-sm leading-tight text-outline">
              {credit?.score_available
                ? credit.disclaimer
                : `Credit unlocks after ${credit?.required_fulfilments ?? 5} kept meetups. ${
                    credit?.disclaimer ?? ""
                  }`}
            </p>
          </div>
        </div>

        {/* Credentials carousel */}
        <section className="flex flex-col gap-space-sm">
          <div className="flex items-center justify-between px-space-2xs">
            <div className="flex items-center gap-2">
              <h3 className="text-headline-sm text-on-surface">Credentials</h3>
              <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-label-sm text-primary">
                {credentials.length}
              </span>
            </div>
            {credentials.length > 0 && (
              <GhostButton onClick={() => router.push("/credentials")}>
                See all
              </GhostButton>
            )}
          </div>

          {credentials.length === 0 ? (
            <p className="rounded bg-surface-container-low p-space-md text-body-sm text-on-surface-variant">
              No credentials yet. Complete a meetup and one is minted
              automatically.
            </p>
          ) : (
            <div className="-mx-gutter-mobile flex gap-space-sm overflow-x-auto no-scrollbar px-gutter-mobile pb-space-xs pt-1">
              {credentials.map((c) => (
                <CredentialBadge key={c.id} credential={c} />
              ))}
            </div>
          )}
        </section>

        {/* Settings */}
        <section className="flex flex-col gap-space-xs">
          <span className="px-space-2xs text-label-sm uppercase tracking-wider text-on-surface-variant">
            Settings &amp; privacy
          </span>

          <div className="overflow-hidden rounded-lg bg-surface-container shadow-float">
            <Link
              href="/preferences"
              className="flex w-full items-center justify-between p-space-md text-left transition-colors active:bg-surface-container-highest"
            >
              <span className="flex items-center gap-space-sm">
                <SettingIcon icon="auto_awesome" tone="text-primary" />
                <span className="flex flex-col">
                  <span className="text-label-lg text-on-surface">
                    Matching preferences
                  </span>
                  <span className="text-body-sm text-on-surface-variant">
                    Star sign, MBTI, interests and background
                  </span>
                </span>
              </span>
              <Icon name="chevron_right" size={22} className="text-outline" />
            </Link>

            <button
              type="button"
              onClick={() => setGenderOpen((o) => !o)}
              className="flex w-full items-center justify-between p-space-md text-left transition-colors active:bg-surface-container-highest"
            >
              <span className="flex items-center gap-space-sm">
                <SettingIcon icon="shield" tone="text-primary" />
                <span className="flex flex-col">
                  <span className="text-label-lg text-on-surface">
                    Safety preferences
                  </span>
                  <span className="text-body-sm text-on-surface-variant">
                    Gender: {user.gender}
                    {user.gender === "undisclosed" &&
                      " — set this to use same-gender matching"}
                  </span>
                </span>
              </span>
              <Icon
                name={genderOpen ? "expand_less" : "chevron_right"}
                size={22}
                className="text-outline"
              />
            </button>

            {genderOpen && (
              <div className="flex animate-fade-in flex-wrap gap-space-xs border-t border-surface-container-high p-space-md">
                {(["female", "male", "other", "undisclosed"] as Gender[]).map(
                  (g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGender(g)}
                      className={`h-9 rounded-full px-space-md text-label-md capitalize transition-all active:scale-95 ${
                        user.gender === g
                          ? "bg-primary-container text-white shadow-beacon"
                          : "bg-surface-container-low text-on-surface-variant"
                      }`}
                    >
                      {g}
                    </button>
                  ),
                )}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-surface-container-high p-space-md">
              <span className="flex min-w-0 items-center gap-space-sm">
                <SettingIcon icon="account_balance_wallet" tone="text-secondary" />
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2">
                    <span className="text-label-lg text-on-surface">Wallet</span>
                    <span className="rounded bg-surface-container-highest px-1.5 py-0.5 text-label-status uppercase text-on-surface-variant">
                      {wallet?.managed ? "Managed" : "Self-custody"}
                    </span>
                  </span>
                  <span className="truncate font-mono text-body-sm text-outline">
                    {shortAddress(user.wallet_address)}
                  </span>
                </span>
              </span>
            </div>

            {/* Custody disclosure comes straight from the API — managed accounts
                are custodial and the app must say so. */}
            {wallet && (
              <div className="flex items-start gap-space-xs border-t border-surface-container-high bg-surface-container-low p-space-md">
                <Icon
                  name={wallet.managed ? "info" : "key"}
                  size={18}
                  className="mt-0.5 shrink-0 text-outline"
                />
                <p className="text-body-sm leading-snug text-on-surface-variant">
                  {wallet.custody_disclosure}
                </p>
              </div>
            )}
          </div>
        </section>

        <div className="flex justify-center pb-space-md pt-space-xs">
          <GhostButton icon="logout" onClick={signOut}>
            Log out
          </GhostButton>
        </div>
      </main>

      <BottomNav />
    </>
  );
}

function Stat({
  icon,
  tone,
  bg,
  value,
  label,
}: {
  icon: string;
  tone: string;
  bg: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded bg-surface-container-low p-space-md text-center">
      <span
        className={`mb-space-2xs flex h-10 w-10 items-center justify-center rounded-full ${bg} ${tone}`}
      >
        <Icon name={icon} size={22} filled />
      </span>
      <span className="text-headline-sm font-bold text-on-surface">{value}</span>
      <span className="mt-0.5 text-label-sm text-on-surface-variant">{label}</span>
    </div>
  );
}

function SettingIcon({ icon, tone }: { icon: string; tone: string }) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-low ${tone}`}
    >
      <Icon name={icon} size={22} />
    </span>
  );
}

function CredentialBadge({ credential }: { credential: FulfilmentCredential }) {
  const kept = credential.outcome === "kept";
  return (
    <div className="flex min-w-[200px] shrink-0 flex-col gap-space-sm rounded bg-surface-container p-space-sm shadow-float">
      <div className="relative flex h-24 items-center justify-center overflow-hidden rounded bg-surface-container-highest">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-container/35 to-secondary-container/25" />
        <Icon
          name={sceneIcon(credential.scene)}
          size={36}
          filled
          className="relative text-white/90"
        />
        <span className="absolute right-2 top-2">
          <StatusChip tone={kept ? "verified" : "warn"}>
            {credential.outcome}
          </StatusChip>
        </span>
      </div>
      <div className="flex flex-col">
        <span className="truncate text-label-lg text-on-surface">
          {sceneLabel(credential.scene)}
        </span>
        <span className="flex items-center gap-1 text-body-sm text-on-surface-variant">
          <Icon name="event" size={14} />
          {credential.occurred_at ? formatDate(credential.occurred_at) : "—"}
        </span>
      </div>
    </div>
  );
}
