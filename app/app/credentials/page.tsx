"use client";

import { useCallback, useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import Icon from "@/components/Icon";
import RequireAuth from "@/components/RequireAuth";
import StatusChip from "@/components/StatusChip";
import { EmptyState, ErrorBanner, ScreenLoader } from "@/components/States";
import { api, ApiError } from "@/lib/api";
import { formatDate, sceneIcon, sceneLabel } from "@/lib/format";
import type { Credit, FulfilmentCredential } from "@/lib/types";

export default function CredentialsPage() {
  return <RequireAuth>{() => <Credentials />}</RequireAuth>;
}

function Credentials() {
  const [items, setItems] = useState<FulfilmentCredential[] | null>(null);
  const [credit, setCredit] = useState<Credit | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, creditRes] = await Promise.all([
        api.credentials.listMine(50),
        api.credentials.credit(),
      ]);
      setItems(list.items);
      setCredit(creditRes);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not load your credentials.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <AppHeader title="MonadMate" subtitle="Credentials" />

      <main className="flex flex-1 flex-col gap-space-lg px-gutter-mobile pb-28 pt-20">
        {error && <ErrorBanner message={error} onRetry={load} />}

        {credit && (
          <div className="flex flex-col gap-space-sm rounded-lg bg-surface-container p-space-lg shadow-float">
            <div className="flex items-center justify-between">
              <span className="text-label-sm uppercase tracking-wider text-on-surface-variant">
                Follow-through
              </span>
              {credit.score_available && credit.credit_score !== null && (
                <span className="text-headline-md text-primary">
                  {Math.round(credit.credit_score)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-space-xs">
              <Tally label="Kept" value={credit.fulfilled_count} tone="text-tertiary" />
              <Tally label="No-shows" value={credit.no_show_count} tone="text-error" />
              <Tally label="In review" value={credit.disputed_count} tone="text-secondary" />
            </div>

            <p className="flex items-start gap-space-2xs text-body-sm leading-snug text-outline">
              <Icon name="info" size={15} className="mt-0.5 shrink-0" />
              {credit.score_available
                ? credit.disclaimer
                : `Score unlocks after ${credit.required_fulfilments} kept meetups. ${credit.disclaimer}`}
            </p>
          </div>
        )}

        {items === null && !error ? (
          <ScreenLoader label="Loading credentials" />
        ) : items && items.length === 0 ? (
          <EmptyState
            icon="verified"
            title="No credentials yet"
            body="Complete a meetup and a soulbound credential is minted automatically — recording the place and time, never who you met."
          />
        ) : (
          <section className="flex flex-col gap-space-sm">
            {items?.map((c) => (
              <CredentialRow key={c.id} credential={c} />
            ))}
          </section>
        )}
      </main>

      <BottomNav />
    </>
  );
}

function Tally({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex flex-col items-center rounded bg-surface-container-low p-space-sm">
      <span className={`text-headline-sm ${tone}`}>{value}</span>
      <span className="text-label-sm text-on-surface-variant">{label}</span>
    </div>
  );
}

function CredentialRow({ credential }: { credential: FulfilmentCredential }) {
  const kept = credential.outcome === "kept";
  return (
    <div className="flex items-center gap-space-sm rounded-lg bg-surface-container p-space-md shadow-float">
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded">
        <span className="absolute inset-0 bg-gradient-to-br from-primary-container/40 to-secondary-container/30" />
        <Icon
          name={sceneIcon(credential.scene)}
          size={24}
          filled
          className="relative text-white/90"
        />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-label-lg text-on-surface">
          {sceneLabel(credential.scene)}
          {credential.venue_type && (
            <span className="text-on-surface-variant"> · {credential.venue_type}</span>
          )}
        </span>
        <span className="block text-body-sm text-on-surface-variant">
          {credential.occurred_at ? formatDate(credential.occurred_at) : "—"}
          {credential.duration_minutes && ` · ${credential.duration_minutes} min`}
        </span>
        <span className="mt-0.5 flex items-center gap-space-2xs text-body-sm text-outline">
          <Icon name="lock" size={13} />
          Soulbound
          {credential.mint_status === "pending" && " · mint pending"}
          {credential.tx_hash && " · on-chain"}
        </span>
      </span>

      <StatusChip tone={kept ? "verified" : "warn"}>
        {credential.outcome}
      </StatusChip>
    </div>
  );
}
