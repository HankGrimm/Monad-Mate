"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import Avatar from "@/components/Avatar";
import { GlassButton } from "@/components/Button";
import Icon from "@/components/Icon";
import RequireAuth from "@/components/RequireAuth";
import StatusChip from "@/components/StatusChip";
import { ErrorBanner, ScreenLoader } from "@/components/States";
import { api, ApiError } from "@/lib/api";
import type { Attestation, MeetupMatchDetail } from "@/lib/types";

export default function CheckInPage({ params }: { params: { id: string } }) {
  return <RequireAuth>{() => <CheckIn matchId={params.id} />}</RequireAuth>;
}

function CheckIn({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [match, setMatch] = useState<MeetupMatchDetail | null>(null);
  const [attestation, setAttestation] = useState<Attestation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const detail = await api.meetups.match(matchId);
      setMatch(detail);

      // Reuse an in-flight attestation if one exists; otherwise open one so the
      // QR token is available immediately.
      const mine = await api.attestations.listMine().catch(() => [] as Attestation[]);
      const existing = mine.find(
        (a) => a.status === "initiated" || a.status === "pending_confirm",
      );
      setAttestation(
        existing ??
          (await api.attestations.initiate({
            match_id: matchId,
            method: "qr_code",
            // R6: link the check-in to the meetup so the deposit can be
            // released automatically when both sides confirm.
            meetup_match_id: matchId,
          })),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not start check-in.",
      );
    }
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll for the counterpart's confirmation. 5s is frequent enough to feel live
  // during a demo without hammering the API.
  useEffect(() => {
    if (!attestation || attestation.status === "confirmed") return;
    const timer = setInterval(async () => {
      try {
        const mine = await api.attestations.listMine();
        const fresh = mine.find((a) => a.id === attestation.id);
        if (fresh) {
          setAttestation(fresh);
          if (fresh.status === "confirmed") {
            router.push(`/matches/${matchId}/success`);
          }
        }
      } catch {
        // Transient failure — keep the previous state and try again next tick.
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [attestation, matchId, router]);

  async function checkInWithLocation() {
    if (!attestation) return;
    setLocating(true);
    setError(null);
    setLocationNote(null);

    if (!navigator.geolocation) {
      setError("This browser can't share a location. Use the QR code instead.");
      setLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const fresh = await api.attestations.confirm(attestation.id, {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          setAttestation(fresh);
          setLocationNote("Location match verified.");
          if (fresh.status === "confirmed") {
            router.push(`/matches/${matchId}/success`);
          }
        } catch (err) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not verify your location.",
          );
        } finally {
          setLocating(false);
        }
      },
      () => {
        setError(
          "Location permission denied. Scan the QR code instead, or allow location and retry.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  if (!match || !attestation) {
    return (
      <>
        <AppHeader title="Check-in verification" back />
        <main className="flex flex-1 flex-col px-gutter-mobile pt-20">
          {error ? <ErrorBanner message={error} onRetry={load} /> : <ScreenLoader />}
        </main>
      </>
    );
  }

  const name = match.counterpart.display_name ?? "Your match";
  const youDone = attestation.initiator_confirmed;
  const theyDone = attestation.counterparty_confirmed;

  return (
    <>
      <AppHeader title="Check-in verification" back />

      <main className="flex flex-1 flex-col gap-space-xl px-gutter-mobile pb-space-3xl pt-20">
        {error && <ErrorBanner message={error} />}

        <div className="flex flex-col items-center gap-space-xs text-center">
          <StatusChip tone="verified" icon="sensors">
            {match.venue_name}
          </StatusChip>
          <h2 className="text-headline-lg text-on-surface">Meetup check-in</h2>
          <p className="max-w-[280px] text-body-md text-on-surface-variant">
            Scan each other&apos;s code to check in and release both deposits.
          </p>
        </div>

        <QrPanel token={attestation.token} />

        <div className="flex justify-center">
          <GlassButton
            icon="near_me"
            onClick={checkInWithLocation}
            loading={locating}
          >
            {locationNote ?? "Or check in with location"}
          </GlassButton>
        </div>

        {/* Mutual verification progress */}
        <div className="relative overflow-hidden rounded-lg bg-surface-container p-space-lg shadow-float">
          <div className="pointer-events-none absolute right-0 top-0 h-36 w-36 rounded-full bg-primary-container/10 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-0 h-36 w-36 rounded-full bg-tertiary/10 blur-3xl" />

          <div className="relative flex flex-col gap-space-lg">
            <div className="flex items-center justify-between">
              <span className="text-label-sm uppercase tracking-wider text-on-surface-variant">
                Mutual verification
              </span>
              <StatusChip tone={youDone && theyDone ? "verified" : "neutral"}>
                {youDone && theyDone ? "Complete" : "1 of 2"}
              </StatusChip>
            </div>

            <div className="relative flex items-center justify-around">
              {/* Connector */}
              <div className="absolute left-1/2 top-7 h-1 w-[45%] -translate-x-1/2 overflow-hidden rounded-full bg-surface-container-highest">
                <div
                  className={`h-full bg-gradient-to-r from-tertiary to-primary transition-all duration-500 ${
                    youDone && theyDone ? "w-full" : youDone || theyDone ? "w-1/2" : "w-0"
                  }`}
                />
              </div>

              <Party
                label="You"
                done={youDone}
                doneText="Checked in"
                pendingText="Not yet"
                seed={`${match.id}-you`}
              />
              <Party
                label={name}
                done={theyDone}
                doneText="Checked in"
                pendingText="Pending check-in…"
                seed={match.id}
              />
            </div>

            <div className="flex items-center justify-center gap-space-xs rounded bg-surface-container-high px-space-md py-space-xs text-center text-on-surface-variant">
              <Icon
                name={youDone && theyDone ? "check_circle" : "hourglass_top"}
                size={18}
                className={youDone && theyDone ? "text-tertiary" : "text-primary"}
              />
              <span className="text-body-sm">
                {youDone && theyDone
                  ? "Both checked in — releasing deposits"
                  : `Waiting for ${name} to scan your code`}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-space-sm text-body-sm text-on-surface-variant">
          <span className="flex items-center gap-space-xs">
            <Icon name="verified_user" size={18} className="text-tertiary" />
            Verified within 100m
          </span>
          <span className="text-outline">Both sides must confirm</span>
        </div>
      </main>
    </>
  );
}

/**
 * QR frame.
 *
 * The token is rendered as text, not an encoded QR bitmap — generating a real
 * QR would need a dependency that isn't installed. The counterpart can still
 * complete the flow by entering the token or using location check-in.
 */
function QrPanel({ token }: { token: string | null }) {
  return (
    <div className="flex justify-center">
      <div className="relative flex aspect-square w-full max-w-[320px] flex-col items-center justify-center overflow-hidden rounded-md bg-surface-container-low p-space-xl shadow-beacon">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-container/15 via-transparent to-secondary-container/15" />

        {/* Framing corners */}
        <span className="absolute left-3 top-3 h-5 w-5 rounded-tl-lg bg-surface-container-highest" />
        <span className="absolute right-3 top-3 h-5 w-5 rounded-tr-lg bg-surface-container-highest" />
        <span className="absolute bottom-3 left-3 h-5 w-5 rounded-bl-lg bg-surface-container-highest" />
        <span className="absolute bottom-3 right-3 h-5 w-5 rounded-br-lg bg-surface-container-highest" />

        <div className="relative flex h-full w-full flex-col items-center justify-center gap-space-md rounded bg-surface-container-lowest p-space-md">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-primary-container to-secondary-container shadow-beacon">
            <Icon name="qr_code_2" size={34} className="text-white" />
          </div>
          <div className="flex flex-col items-center gap-space-2xs px-space-sm text-center">
            <span className="text-label-sm uppercase tracking-wider text-on-surface-variant">
              Your check-in code
            </span>
            <span className="break-all font-mono text-body-md text-on-surface">
              {token ?? "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Party({
  label,
  done,
  doneText,
  pendingText,
  seed,
}: {
  label: string;
  done: boolean;
  doneText: string;
  pendingText: string;
  seed: string;
}) {
  return (
    <div className="relative z-10 flex w-28 flex-col items-center gap-space-xs text-center">
      <Avatar
        name={label}
        seed={seed}
        size={64}
        ring={done ? "verified" : "pending"}
        badge={done ? "check" : "pending"}
      />
      <div className="flex flex-col">
        <span className="truncate text-headline-sm text-on-surface">{label}</span>
        <span
          className={`text-label-sm ${done ? "text-tertiary" : "text-on-surface-variant"}`}
        >
          {done ? doneText : pendingText}
        </span>
      </div>
    </div>
  );
}
