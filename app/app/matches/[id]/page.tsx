"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import Avatar from "@/components/Avatar";
import { GradientButton } from "@/components/Button";
import { CardRow } from "@/components/Card";
import Icon from "@/components/Icon";
import RequireAuth from "@/components/RequireAuth";
import StatusChip from "@/components/StatusChip";
import { ErrorBanner, ScreenLoader } from "@/components/States";
import { api, ApiError } from "@/lib/api";
import { formatWindow, sceneIcon, sceneLabel, startsIn, venueIcon } from "@/lib/format";
import { DepositError, explorerTxUrl, sendDeposit } from "@/lib/monad";
import type { DepositRequirements, MeetupMatchDetail, Stake } from "@/lib/types";

/** Fixed commitment deposit. Mirrors MIN_STAKE_MEETUP_MON on the backend. */
const DEPOSIT_MON = 5.0;

export default function MatchPage({ params }: { params: { id: string } }) {
  return <RequireAuth>{() => <MatchDetail id={params.id} />}</RequireAuth>;
}

function MatchDetail({ id }: { id: string }) {
  const router = useRouter();
  const [match, setMatch] = useState<MeetupMatchDetail | null>(null);
  const [stake, setStake] = useState<Stake | null>(null);
  const [reqs, setReqs] = useState<DepositRequirements | null>(null);
  const [pledged, setPledged] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [detail, myStakes, requirements] = await Promise.all([
        api.meetups.match(id),
        api.stakes.listMine().catch(() => [] as Stake[]),
        api.stakes.requirements(DEPOSIT_MON).catch(() => null),
      ]);
      setMatch(detail);
      setReqs(requirements);
      // A deposit already tied to *this* meetup means the step is done.
      setStake(
        myStakes.find(
          (s) =>
            s.stake_type === "confirm_meetup" &&
            s.status === "active" &&
            s.meetup_match_id === id,
        ) ?? null,
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load this meetup.",
      );
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function acceptMatch() {
    setBusy(true);
    setError(null);
    try {
      await api.meetups.respond(id, true);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not confirm.");
    } finally {
      setBusy(false);
    }
  }

  async function deposit() {
    setBusy(true);
    setError(null);
    try {
      let txHash: string | undefined;

      // When the server publishes a deposit address, the deposit must be a real
      // testnet transaction — the backend verifies it and rejects anything it
      // can't confirm on-chain.
      if (reqs?.onchain_required) {
        setStage("Confirm the transaction in your wallet…");
        const sent = await sendDeposit(reqs);
        txHash = sent.txHash;
        setStage("Verifying on Monad testnet…");
      }

      const created = await api.stakes.create({
        stake_type: "confirm_meetup",
        amount_mon: DEPOSIT_MON,
        meetup_match_id: id,
        tx_hash: txHash,
      });
      setStake(created);
    } catch (err) {
      if (err instanceof DepositError) setError(err.message);
      else if (err instanceof ApiError) setError(err.message);
      else if (err instanceof Error) setError(err.message);
      else setError("Could not place the deposit.");
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  if (!match) {
    return (
      <>
        <AppHeader title="Meetup detail" back />
        <main className="flex flex-1 flex-col px-gutter-mobile pt-20">
          {error ? <ErrorBanner message={error} onRetry={load} /> : <ScreenLoader />}
        </main>
      </>
    );
  }

  const confirmed = match.status === "confirmed";
  const countdown = startsIn(match.window_start);
  const name = match.counterpart.display_name ?? "Your match";

  return (
    <>
      <AppHeader title="Meetup detail" back />

      <main className="flex flex-1 flex-col gap-space-lg px-gutter-mobile pb-space-3xl pt-20">
        {error && <ErrorBanner message={error} />}

        {/* Counterpart hero */}
        <div className="relative overflow-hidden rounded-lg bg-surface-container p-space-lg shadow-float">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary-container/15 via-transparent to-transparent" />
          <div className="relative flex flex-col items-center text-center">
            <Avatar
              name={name}
              seed={match.id}
              size={96}
              ring="brand"
              badge={match.counterpart.verified ? "verified" : undefined}
            />
            <div className="mt-space-sm flex items-center gap-space-2xs">
              <h2 className="text-headline-md text-on-surface">{name}</h2>
              {match.counterpart.verified && (
                <Icon name="check_circle" size={20} filled className="text-tertiary" />
              )}
            </div>

            {match.counterpart.fulfilled_count > 0 && (
              <p className="mt-space-2xs text-body-sm text-on-surface-variant">
                {match.counterpart.fulfilled_count} meetups kept
                {match.counterpart.credit_score !== null &&
                  ` · credit ${Math.round(match.counterpart.credit_score)}`}
              </p>
            )}

            <div className="mt-space-md">
              {confirmed ? (
                <StatusChip tone="verified" icon="check_circle">
                  Both confirmed
                </StatusChip>
              ) : match.they_accepted && !match.you_accepted ? (
                <StatusChip tone="brand" pulse>
                  They&apos;re in — your turn
                </StatusChip>
              ) : (
                <StatusChip tone="hot" pulse>
                  Waiting for {name} to confirm
                </StatusChip>
              )}
            </div>

            {match.reasons.length > 0 && (
              <div className="mt-space-md flex flex-wrap justify-center gap-space-2xs">
                {match.reasons.slice(0, 3).map((reason) => (
                  <span
                    key={reason}
                    className="rounded-full bg-surface-container-low px-space-sm py-space-2xs text-body-sm text-on-surface-variant"
                  >
                    {reason}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Meetup summary */}
        <div className="flex flex-col gap-space-md rounded-lg bg-surface-container p-space-lg shadow-float">
          <div className="flex items-center justify-between">
            <span className="text-label-status uppercase tracking-wider text-primary">
              Meetup details
            </span>
            <span className="rounded-full bg-surface-container-high px-space-xs py-space-2xs text-label-sm text-on-surface-variant">
              Party of {match.party_size}
            </span>
          </div>

          <div className="flex flex-col gap-space-sm">
            <CardRow
              icon={<Icon name={venueIcon(match.venue_type)} size={20} />}
              label="Gathering spot"
              value={match.venue_name}
            />
            <CardRow
              icon={<Icon name={sceneIcon(match.scene)} size={20} />}
              iconTone="text-secondary"
              label="Planned activity"
              value={sceneLabel(match.scene)}
            />
            <CardRow
              icon={<Icon name="schedule" size={20} />}
              iconTone="text-tertiary"
              label="Time slot"
              value={formatWindow(match.window_start, match.window_end)}
              hint={
                countdown ? (
                  <span className="inline-flex items-center gap-1 text-tertiary">
                    <Icon name="bolt" size={14} />
                    {countdown}
                  </span>
                ) : undefined
              }
            />
          </div>
        </div>

        {/* Deposit */}
        <div className="relative overflow-hidden rounded-lg bg-surface-container p-space-lg shadow-float">
          <div className="pointer-events-none absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-primary-container/10 blur-2xl" />
          <div className="relative flex flex-col gap-space-md">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-space-2xs">
                <Icon name="verified_user" size={20} className="text-primary" />
                <span className="text-label-lg text-on-surface">
                  Attendance commitment
                </span>
              </span>
              <StatusChip tone="verified">100% refundable</StatusChip>
            </div>

            <div className="flex flex-col items-center rounded bg-surface-container-lowest p-space-md text-center shadow-inner">
              <span className="mb-space-2xs text-body-sm text-on-surface-variant">
                Hold amount
              </span>
              <div className="flex items-baseline gap-space-2xs">
                <span className="text-display-hero-mobile text-primary">
                  {DEPOSIT_MON.toFixed(2)}
                </span>
                <span className="text-headline-sm text-on-surface">MON</span>
              </div>
              <p className="mt-space-2xs max-w-[280px] text-body-sm text-on-surface-variant">
                Returned automatically when you both check in. This is a promise
                about your own attendance — not a bet on whether {name} shows up.
              </p>
              {reqs && (
                <span className="mt-space-xs flex items-center gap-space-2xs text-label-sm text-outline">
                  <Icon
                    name={reqs.onchain_required ? "link" : "science"}
                    size={14}
                  />
                  {reqs.onchain_required
                    ? "Monad testnet · real MON transfer"
                    : "Demo mode · no on-chain transfer configured"}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-space-xs">
              <TrustNote
                icon="lock_clock"
                tone="text-tertiary"
                strong="Safe escrow:"
                text="Refunded as soon as you both scan at the venue."
              />
              <TrustNote
                icon="balance"
                tone="text-primary"
                text="If only one of you checks in, it goes to review — a one-sided claim never auto-penalises anyone."
              />
            </div>
          </div>
        </div>

        {/* Action */}
        <div className="mt-auto flex flex-col gap-space-sm pt-space-md">
          {stake ? (
            <>
              <div className="flex items-start gap-space-sm rounded bg-tertiary/15 border border-tertiary/30 p-space-md">
                <Icon
                  name="check_circle"
                  size={22}
                  filled
                  className="mt-0.5 shrink-0 text-tertiary"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-body-md text-on-surface">
                    Deposit held. You&apos;re ready to meet.
                  </p>
                  {stake.tx_hash && (
                    <a
                      href={explorerTxUrl(stake.tx_hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-space-2xs text-body-sm text-primary underline"
                    >
                      {stake.onchain_verified
                        ? "Verified on Monad testnet"
                        : "View transaction"}
                      <Icon name="open_in_new" size={13} />
                    </a>
                  )}
                </div>
              </div>
              <GradientButton
                icon="qr_code_scanner"
                onClick={() => router.push(`/matches/${id}/checkin`)}
              >
                Go to check-in
              </GradientButton>
            </>
          ) : !match.you_accepted ? (
            <GradientButton onClick={acceptMatch} loading={busy} icon="handshake">
              Confirm this meetup
            </GradientButton>
          ) : !confirmed ? (
            <>
              <GradientButton disabled icon="hourglass_top">
                Waiting for {name}
              </GradientButton>
              <p className="text-center text-body-sm text-outline">
                You can deposit once both sides have confirmed.
              </p>
            </>
          ) : (
            <>
              <label className="flex cursor-pointer items-center gap-space-sm rounded bg-surface-container-low p-space-sm transition-transform active:scale-[0.99]">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={pledged}
                  onChange={(e) => setPledged(e.target.checked)}
                />
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${
                    pledged
                      ? "bg-primary-container shadow-beacon text-white"
                      : "bg-surface-container-high"
                  }`}
                >
                  {pledged && <Icon name="check" size={16} />}
                </span>
                <span className="select-none text-body-sm text-on-surface">
                  I agree to arrive within the scheduled window and verify via
                  check-in.
                </span>
              </label>

              <GradientButton
                onClick={deposit}
                loading={busy}
                disabled={!pledged}
                icon="shield_with_heart"
              >
                Confirm &amp; deposit {DEPOSIT_MON.toFixed(2)} MON
              </GradientButton>
              <p className="flex items-center justify-center gap-space-2xs text-center text-label-sm text-on-surface-variant">
                <Icon name="bolt" size={14} />
                {stage ??
                  (reqs?.onchain_required
                    ? "Your wallet will ask you to approve a MON transfer"
                    : "Recorded without an on-chain transfer in demo mode")}
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}

function TrustNote({
  icon,
  tone,
  strong,
  text,
}: {
  icon: string;
  tone: string;
  strong?: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-space-xs">
      <Icon name={icon} size={18} className={`mt-0.5 shrink-0 ${tone}`} />
      <p className="text-body-sm text-on-surface-variant">
        {strong && <strong className="text-label-md text-on-surface">{strong} </strong>}
        {text}
      </p>
    </div>
  );
}
