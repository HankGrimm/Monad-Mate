"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import Avatar from "@/components/Avatar";
import { GhostButton, GradientButton } from "@/components/Button";
import { CardRow } from "@/components/Card";
import Icon from "@/components/Icon";
import RequireAuth from "@/components/RequireAuth";
import StatusChip from "@/components/StatusChip";
import { ErrorBanner, ScreenLoader } from "@/components/States";
import { api, ApiError } from "@/lib/api";
import { formatWindow, sceneIcon, sceneLabel, startsIn, venueIcon } from "@/lib/format";
import { DepositError, explorerTxUrl, sendDeposit } from "@/lib/monad";
import type {
  DepositRequirements, MeetupMatchDetail, MeetupPlan, Stake,
} from "@/lib/types";

/** Placeholder until the backend tells us the actual required amount. */
const DEPOSIT_MON_DEFAULT = 0.05;

export default function MatchPage({ params }: { params: { id: string } }) {
  return <RequireAuth>{() => <MatchDetail id={params.id} />}</RequireAuth>;
}

function MatchDetail({ id }: { id: string }) {
  const router = useRouter();
  const [match, setMatch] = useState<MeetupMatchDetail | null>(null);
  const [stake, setStake] = useState<Stake | null>(null);
  const [reqs, setReqs] = useState<DepositRequirements | null>(null);
  const [plan, setPlan] = useState<MeetupPlan | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [pledged, setPledged] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Authoritative deposit amount — from the backend, with a local fallback. */
  const depositMon = reqs?.amount_mon ?? DEPOSIT_MON_DEFAULT;

  const load = useCallback(async () => {
    setError(null);
    try {
      // Fetch requirements without an explicit amount so the backend default
      // (MIN_STAKE_MEETUP_MON from .env) is authoritative.
      const [detail, myStakes, requirements] = await Promise.all([
        api.meetups.match(id),
        api.stakes.listMine().catch(() => [] as Stake[]),
        api.stakes.requirements().catch(() => null),
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

  // R3: load the plan once both sides have confirmed. The backend generates it
  // on first access, so this call may take a moment the first time.
  useEffect(() => {
    if (!match || match.status !== "confirmed" || plan) return;
    api.meetups
      .plan(id)
      .then(setPlan)
      .catch(() => {
        // A plan is nice-to-have, not blocking — a failure shouldn't break the
        // confirmation screen. The section simply stays hidden.
      });
  }, [match, plan, id]);

  async function regeneratePlan() {
    setPlanBusy(true);
    try {
      setPlan(await api.meetups.regeneratePlan(id));
    } catch {
      // Keep the old plan on failure rather than clearing it.
    } finally {
      setPlanBusy(false);
    }
  }

  async function adoptPlan() {
    if (!plan) return;
    setPlanBusy(true);
    try {
      setPlan(await api.meetups.adoptPlan(id));
    } catch {
      // Adoption is a metric, not a gate — ignore failures.
    } finally {
      setPlanBusy(false);
    }
  }

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

  async function submitReport(type: string, description: string) {
    await api.meetups.reportCounterpart(id, { report_type: type, description });
  }

  async function blockCounterpart() {
    // Blocking needs a user id, which the match detail intentionally omits.
    // The report endpoint covers the safety path; blocking is done from
    // the counterpart's candidate card or after the report is resolved.
    return;
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
        const sent = await sendDeposit(reqs, id);
        txHash = sent.txHash;
        setStage("Verifying on Monad testnet…");
      }

      const created = await api.stakes.create({
        stake_type: "confirm_meetup",
        amount_mon: depositMon,
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
        {notice && (
          <div className="flex items-start gap-space-xs rounded bg-tertiary/15 border border-tertiary/30 p-space-md">
            <Icon name="check_circle" size={20} filled className="mt-0.5 shrink-0 text-tertiary" />
            <p className="min-w-0 flex-1 text-body-md text-on-surface">{notice}</p>
          </div>
        )}

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
                  {depositMon.toFixed(2)}
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

        {/* R3: AI-generated activity plan */}
        {match.status === "confirmed" && plan && (
          <PlanSection
            plan={plan}
            busy={planBusy}
            onRegenerate={regeneratePlan}
            onAdopt={adoptPlan}
          />
        )}

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
                Confirm &amp; deposit {depositMon.toFixed(2)} MON
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

        {/* Safety: report */}
        <ReportButton
          matchId={id}
          onSubmit={submitReport}
          onError={setError}
          onDone={() => setNotice("Report filed. It will be reviewed.")}
        />
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------
// Safety report
// ---------------------------------------------------------------------------

const REPORT_TYPES = [
  { value: "harassment", label: "Harassment", icon: "block" },
  { value: "no_show", label: "Didn't show up", icon: "person_off" },
  { value: "scam", label: "Scam or fraud", icon: "gpp_bad" },
  { value: "fake_profile", label: "Fake profile", icon: "person_search" },
  { value: "other", label: "Something else", icon: "help" },
] as const;

function ReportButton({
  matchId,
  onSubmit,
  onError,
  onDone,
}: {
  matchId: string;
  onSubmit: (type: string, description: string) => Promise<void>;
  onError: (msg: string) => void;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!type || description.trim().length < 10) return;
    setBusy(true);
    try {
      await onSubmit(type, description.trim());
      setOpen(false);
      setType("");
      setDescription("");
      onDone();
    } catch (err) {
      onError(
        err instanceof ApiError ? err.message : "Could not file the report.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-space-sm flex items-center justify-center gap-space-2xs px-space-md py-space-xs text-label-md text-outline transition-colors hover:text-error active:scale-95"
      >
        <Icon name="flag" size={16} />
        Report a problem
      </button>
    );
  }

  return (
    <section className="relative flex flex-col gap-space-md overflow-hidden rounded-lg bg-surface-container p-space-lg shadow-float">
      <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-error-container/10 blur-2xl" />
      <div className="relative flex items-center justify-between">
        <span className="flex items-center gap-space-2xs text-label-lg text-on-surface">
          <Icon name="flag" size={18} className="text-error" />
          Report {matchId ? "" : ""}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-outline transition-colors hover:text-on-surface"
          aria-label="Cancel report"
        >
          <Icon name="close" size={20} />
        </button>
      </div>

      <p className="text-body-sm text-on-surface-variant">
        Your report goes to review before anything happens. A single report
        doesn&apos;t auto-penalise anyone.
      </p>

      <div className="relative flex flex-col gap-space-xs">
        <span className="text-label-sm uppercase tracking-wider text-on-surface-variant">
          What happened?
        </span>
        <div className="flex flex-wrap gap-space-2xs">
          {REPORT_TYPES.map((rt) => (
            <button
              key={rt.value}
              type="button"
              onClick={() => setType(rt.value)}
              className={`flex h-9 items-center gap-space-2xs rounded-full px-space-md text-label-md transition-all active:scale-95 ${
                type === rt.value
                  ? "bg-error-container/40 text-error border border-error/40"
                  : "bg-surface-container-low text-on-surface-variant"
              }`}
            >
              <Icon name={rt.icon} size={15} />
              {rt.label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Describe what happened (at least 10 characters)…"
        rows={3}
        maxLength={2000}
        className="rounded border border-surface-container-high bg-surface-container-low p-space-md text-body-md text-on-surface placeholder:text-outline focus:border-error/50 focus:shadow-[0_0_0_3px_rgba(255,180,171,0.15)] focus:outline-none resize-none"
      />

      <div className="flex gap-space-xs">
        <GhostButton onClick={() => setOpen(false)} className="flex-1">
          Cancel
        </GhostButton>
        <GradientButton
          onClick={submit}
          loading={busy}
          disabled={!type || description.trim().length < 10}
          className="flex-1 !bg-none !bg-error-container"
        >
          Submit report
        </GradientButton>
      </div>
    </section>
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

// ---------------------------------------------------------------------------
// R3: AI activity plan
// ---------------------------------------------------------------------------

function PlanSection({
  plan,
  busy,
  onRegenerate,
  onAdopt,
}: {
  plan: MeetupPlan;
  busy: boolean;
  onRegenerate: () => void;
  onAdopt: () => void;
}) {
  const [tab, setTab] = useState<"icebreakers" | "itinerary" | "game">(
    "icebreakers",
  );

  return (
    <section className="relative overflow-hidden rounded-lg bg-surface-container p-space-lg shadow-float">
      <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary-container/15 blur-3xl" />

      <div className="relative flex flex-col gap-space-md">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-space-2xs">
            <Icon name="auto_awesome" size={20} className="text-primary" />
            <span className="text-label-lg text-on-surface">Your plan</span>
          </div>
          <div className="flex items-center gap-space-2xs">
            {plan.adopted ? (
              <StatusChip tone="verified" icon="check_circle">
                Using this
              </StatusChip>
            ) : (
              <GhostButton icon="thumb_up" onClick={onAdopt} disabled={busy}>
                Use this plan
              </GhostButton>
            )}
            <GhostButton icon="refresh" onClick={onRegenerate} disabled={busy}>
              New one
            </GhostButton>
          </div>
        </div>

        {/* Source disclosure — template plans are honest about not being LLM output */}
        <p className="flex items-center gap-space-2xs text-body-sm text-outline">
          <Icon name={plan.source === "llm" ? "psychology" : "grid_view"} size={14} />
          {plan.source === "llm"
            ? "Generated by AI from your shared interests"
            : "Pre-built plan (AI generation not configured)"}
        </p>

        {/* Tab bar */}
        <div className="flex rounded-full bg-surface-container-low p-1">
          {(
            [
              ["icebreakers", "Icebreakers", "forum"],
              ["itinerary", "Timeline", "schedule"],
              ["game", "Mini-game", "sports_esports"],
            ] as const
          ).map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex h-10 flex-1 items-center justify-center gap-space-2xs rounded-full text-label-md transition-all ${
                tab === key
                  ? "bg-surface-container-highest text-on-surface"
                  : "text-on-surface-variant"
              }`}
            >
              <Icon name={icon} size={16} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "icebreakers" && (
          <div className="flex animate-fade-in flex-col gap-space-xs">
            {plan.icebreakers.map((topic, i) => (
              <div
                key={i}
                className="flex items-start gap-space-sm rounded bg-surface-container-low p-space-sm"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-container/20 text-label-sm text-primary">
                  {i + 1}
                </span>
                <p className="text-body-md text-on-surface">{topic}</p>
              </div>
            ))}
            {plan.shared_interests.length > 0 && (
              <p className="px-space-2xs text-body-sm text-outline">
                Based on shared interests: {plan.shared_interests.join(", ")}
              </p>
            )}
          </div>
        )}

        {tab === "itinerary" && (
          <div className="flex animate-fade-in flex-col gap-space-xs">
            {plan.itinerary.map((step, i) => (
              <div
                key={i}
                className="flex items-start gap-space-sm rounded bg-surface-container-low p-space-sm"
              >
                <div className="flex w-10 shrink-0 flex-col items-center">
                  <span className="text-label-status uppercase text-tertiary">
                    +{step.minute}m
                  </span>
                  <span className="mt-space-2xs h-full w-px bg-surface-container-highest" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-label-lg text-on-surface">{step.title}</p>
                  {step.detail && (
                    <p className="text-body-sm text-on-surface-variant">
                      {step.detail}
                    </p>
                  )}
                </div>
              </div>
            ))}
            <p className="px-space-2xs text-body-sm text-outline">
              Fits your {plan.duration_minutes ?? 60}-minute window
            </p>
          </div>
        )}

        {tab === "game" && plan.mini_game?.name ? (
          <div className="flex animate-fade-in flex-col gap-space-sm rounded bg-surface-container-low p-space-md">
            <div className="flex items-center gap-space-sm">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-container to-secondary-container text-white">
                <Icon name="sports_esports" size={22} filled />
              </span>
              <p className="text-label-lg text-on-surface">
                {plan.mini_game.name}
              </p>
            </div>
            <p className="text-body-md text-on-surface-variant">
              {plan.mini_game.how_to_play}
            </p>
          </div>
        ) : (
          <p className="animate-fade-in px-space-2xs text-body-sm text-outline">
            No game for this plan — try regenerating.
          </p>
        )}
      </div>
    </section>
  );
}
