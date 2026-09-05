"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { GradientButton } from "@/components/Button";
import Icon from "@/components/Icon";
import RequireAuth from "@/components/RequireAuth";
import StatusChip from "@/components/StatusChip";
import { ErrorBanner, ScreenLoader } from "@/components/States";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatTime, sceneIcon, sceneLabel } from "@/lib/format";
import type { FulfilmentCredential, MeetupMatchDetail } from "@/lib/types";

export default function SuccessPage({ params }: { params: { id: string } }) {
  return <RequireAuth>{() => <Success matchId={params.id} />}</RequireAuth>;
}

function Success({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [match, setMatch] = useState<MeetupMatchDetail | null>(null);
  const [credential, setCredential] = useState<FulfilmentCredential | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [detail, list] = await Promise.all([
        api.meetups.match(matchId),
        api.credentials.listMine(1),
      ]);
      setMatch(detail);
      // The backend mints on attestation confirmation, so the newest credential
      // is this meetup's.
      setCredential(list.items[0] ?? null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load your credential.",
      );
    }
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!match) {
    return (
      <>
        <AppHeader title="Meetup complete" back />
        <main className="flex flex-1 flex-col px-gutter-mobile pt-20">
          {error ? <ErrorBanner message={error} onRetry={load} /> : <ScreenLoader />}
        </main>
      </>
    );
  }

  const minted = credential?.mint_status === "minted";

  return (
    <>
      <AppHeader title="Meetup complete" back />

      <main className="relative flex flex-1 flex-col px-gutter-mobile pb-space-3xl pt-20">
        {/* Ambient glows */}
        <div className="pointer-events-none absolute -top-10 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-[96px]" />
        <div className="pointer-events-none absolute top-48 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-secondary-container/25 blur-[100px]" />

        <div className="relative flex flex-1 flex-col gap-space-xl">
          {error && <ErrorBanner message={error} />}

          {/* Celebration header */}
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-space-sm flex items-center justify-center">
              <span className="absolute h-20 w-20 rounded-full bg-tertiary/15 animate-ping opacity-60" />
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-high">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-tertiary/20 shadow-onsite">
                  <Icon name="verified" size={28} filled className="text-tertiary" />
                </span>
              </span>
            </div>

            <StatusChip tone="verified" pulse>
              Meetup complete
            </StatusChip>

            <h2 className="mt-space-sm max-w-[280px] text-headline-lg text-on-surface">
              Deposit returned.
              <br />
              {minted ? "Credential minted." : "Credential recorded."}
            </h2>
            <p className="mt-space-xs max-w-sm px-space-md text-body-md text-on-surface-variant">
              Your credential records the place and time — never who you met.
            </p>
          </div>

          {/* Collectible credential card */}
          <CredentialCard match={match} credential={credential} />

          {/* Deposit return */}
          <div className="flex items-center justify-between rounded-lg bg-surface-container p-space-md shadow-float">
            <div className="flex items-center gap-space-sm">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tertiary/20 text-tertiary">
                <Icon name="account_balance_wallet" size={20} filled />
              </span>
              <div className="flex flex-col">
                <span className="text-label-md text-on-surface">
                  Deposit refunded
                </span>
                <span className="text-body-sm text-tertiary">
                  Returned to your balance
                </span>
              </div>
            </div>
            <Icon name="check_circle" size={20} filled className="text-tertiary" />
          </div>

          {/* Reassurances */}
          <div className="grid grid-cols-2 gap-space-xs">
            <MicroCard
              icon="visibility_off"
              tone="text-primary"
              title="Anonymised record"
              body="No counterparty identity is written on-chain."
            />
            <MicroCard
              icon="military_tech"
              tone="text-secondary"
              title="Credit updated"
              body="Follow-through history, not a safety score."
            />
          </div>

          <div className="mt-auto pt-space-md">
            <GradientButton icon="check" onClick={() => router.push("/")}>
              Done
            </GradientButton>
          </div>
        </div>
      </main>
    </>
  );
}

function CredentialCard({
  match,
  credential,
}: {
  match: MeetupMatchDetail;
  credential: FulfilmentCredential | null;
}) {
  const occurred = credential?.occurred_at ?? match.window_start;

  return (
    <div className="w-full px-1">
      {/* Gradient hairline frame */}
      <div className="relative rounded-md bg-gradient-to-br from-primary/60 via-secondary/40 to-primary-container/80 p-[1px] shadow-float">
        <div className="relative overflow-hidden rounded-[15px] bg-gradient-to-b from-surface-container-high via-surface-container-low to-surface-container-lowest p-space-lg">
          <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-gradient-to-br from-primary/15 via-secondary/10 to-transparent blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-tertiary/10 blur-2xl" />

          {/* Card header */}
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-space-xs">
              <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-surface-container-highest text-primary">
                <Icon name="verified_user" size={18} />
              </span>
              <div className="flex flex-col">
                <span className="text-label-sm uppercase tracking-wider text-on-surface-variant">
                  Fulfilment proof
                </span>
                <span className="text-label-md text-on-surface">
                  MonadMate credential
                </span>
              </div>
            </div>
            <StatusChip tone="verified" icon="check_circle">
              {credential?.outcome ?? "kept"}
            </StatusChip>
          </div>

          {/* Emblem */}
          <div className="relative my-space-xl flex items-center gap-space-md rounded bg-surface-container/60 p-space-md shadow-inner">
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-container-highest">
              <span className="absolute inset-0 bg-gradient-to-tr from-primary-container/40 to-secondary/30" />
              <Icon
                name={sceneIcon(credential?.scene ?? match.scene)}
                size={30}
                filled
                className="relative text-primary"
              />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-headline-sm text-on-surface">
                {match.venue_name}
              </span>
              <span className="text-label-md text-on-surface-variant">
                {sceneLabel(credential?.scene ?? match.scene)}
                {credential?.venue_type && ` · ${credential.venue_type}`}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="relative flex flex-col gap-space-sm">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="flex items-center gap-space-2xs text-body-sm">
                <Icon name="schedule" size={15} className="text-primary" />
                {formatDate(occurred)} · {formatTime(occurred)}
              </span>
              {credential?.duration_minutes && (
                <span className="text-label-status uppercase tracking-wider">
                  {credential.duration_minutes} min
                </span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-space-2xs">
                <span className="h-1.5 w-1.5 rounded-full bg-tertiary" />
                <span className="text-label-sm tracking-wide text-primary">
                  {credential?.token_id
                    ? `#${credential.token_id}`
                    : "Verified in person"}
                </span>
              </span>
              <span className="flex items-center gap-1 opacity-70">
                <Icon name="lock" size={13} className="text-on-surface-variant" />
                <span className="text-label-status uppercase text-on-surface-variant">
                  Soulbound
                </span>
              </span>
            </div>

            {credential?.mint_status === "pending" && (
              <p className="text-body-sm text-outline">
                On-chain mint pending — the record is saved and will anchor once
                the contract is configured.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MicroCard({
  icon,
  tone,
  title,
  body,
}: {
  icon: string;
  tone: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-space-xs rounded bg-surface-container-low p-space-sm">
      <Icon name={icon} size={20} className={`mt-0.5 shrink-0 ${tone}`} />
      <div className="flex min-w-0 flex-col">
        <span className="text-label-sm text-on-surface">{title}</span>
        <span className="mt-0.5 text-body-sm text-on-surface-variant">{body}</span>
      </div>
    </div>
  );
}
