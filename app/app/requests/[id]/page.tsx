"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import Avatar from "@/components/Avatar";
import { GhostButton, GlassButton, GradientButton } from "@/components/Button";
import Icon from "@/components/Icon";
import RequireAuth from "@/components/RequireAuth";
import StatusChip from "@/components/StatusChip";
import { EmptyState, ErrorBanner, ScreenLoader } from "@/components/States";
import { api, ApiError } from "@/lib/api";
import { formatWindow, sceneLabel, startsIn, venueIcon } from "@/lib/format";
import type { MeetupCandidate, MeetupMatch, MeetupRequest } from "@/lib/types";

export default function RequestDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <RequireAuth>{() => <RequestDetail id={params.id} />}</RequireAuth>;
}

function RequestDetail({ id }: { id: string }) {
  const router = useRouter();
  const [request, setRequest] = useState<MeetupRequest | null>(null);
  const [candidates, setCandidates] = useState<MeetupCandidate[] | null>(null);
  const [matches, setMatches] = useState<MeetupMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const req = await api.meetups.get(id);
      setRequest(req);

      // Matches always load; candidates only make sense while the request is
      // still looking for someone.
      const [matchList, candidateList] = await Promise.all([
        api.meetups.matches(id),
        req.status === "open" || req.status === "matched"
          ? api.meetups.candidates(id)
          : Promise.resolve([] as MeetupCandidate[]),
      ]);
      setMatches(matchList);
      setCandidates(candidateList);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load this request.",
      );
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function accept(candidate: MeetupCandidate) {
    setActingOn(candidate.counterpart_request_id);
    setError(null);
    try {
      const match = await api.meetups.propose(
        id,
        candidate.counterpart_request_id,
      );
      router.push(`/matches/${match.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not accept that person.",
      );
      setActingOn(null);
    }
  }

  async function cancel() {
    setError(null);
    try {
      await api.meetups.cancel(id);
      router.push("/requests");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not cancel this request.",
      );
    }
  }

  const confirmedMatch = matches.find((m) => m.status === "confirmed");
  const pendingMatch = matches.find(
    (m) => m.status === "accepted" || m.status === "pending",
  );

  return (
    <>
      <AppHeader title="Your request" back />

      <main className="flex flex-1 flex-col gap-space-lg px-gutter-mobile pb-space-3xl pt-20">
        {error && <ErrorBanner message={error} onRetry={load} />}

        {!request ? (
          <ScreenLoader label="Loading request" />
        ) : (
          <>
            <RequestSummary request={request} />

            {(confirmedMatch || pendingMatch) && (
              <button
                type="button"
                onClick={() =>
                  router.push(`/matches/${(confirmedMatch ?? pendingMatch)!.id}`)
                }
                className="flex items-center gap-space-sm rounded-lg bg-surface-container p-space-md shadow-float active:scale-[0.99] transition-transform"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tertiary/15 text-tertiary">
                  <Icon name="handshake" size={22} />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-label-lg text-on-surface">
                    {confirmedMatch ? "Meetup confirmed" : "Waiting on confirmation"}
                  </span>
                  <span className="block text-body-sm text-on-surface-variant">
                    {confirmedMatch
                      ? "Open to deposit and check in"
                      : "One side still needs to accept"}
                  </span>
                </span>
                <Icon name="chevron_right" size={20} className="text-outline" />
              </button>
            )}

            {(request.status === "open" || request.status === "matched") && (
              <section className="flex flex-col gap-space-sm">
                <div className="flex items-center justify-between px-space-2xs">
                  <span className="text-headline-sm text-on-surface">
                    {candidates === null
                      ? "Looking around…"
                      : candidates.length === 0
                        ? "No one yet"
                        : `${candidates.length} ${
                            candidates.length === 1 ? "person" : "people"
                          } free here`}
                  </span>
                  <GhostButton icon="refresh" onClick={load}>
                    Refresh
                  </GhostButton>
                </div>

                {candidates === null ? (
                  <ScreenLoader label="Scanning this venue" />
                ) : candidates.length === 0 ? (
                  <EmptyState
                    icon="radar"
                    title="No one's free here yet."
                    body="We only match people at this exact venue with an overlapping window — so this stays empty rather than showing you someone across town."
                  />
                ) : (
                  candidates.map((c) => (
                    <CandidateCard
                      key={c.counterpart_request_id}
                      candidate={c}
                      busy={actingOn === c.counterpart_request_id}
                      onAccept={() => accept(c)}
                    />
                  ))
                )}
              </section>
            )}

            {(request.status === "open" || request.status === "matched") && (
              <div className="mt-auto pt-space-md">
                <GhostButton icon="close" onClick={cancel} className="w-full justify-center">
                  Cancel this request
                </GhostButton>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

function RequestSummary({ request }: { request: MeetupRequest }) {
  const countdown = startsIn(request.window_start);
  return (
    <div className="relative overflow-hidden rounded-lg bg-surface-container p-space-lg shadow-float">
      <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary-container/15 blur-3xl" />
      <div className="relative flex flex-col gap-space-sm">
        <div className="flex items-center justify-between">
          <StatusChip tone="brand" pulse={request.status === "open"}>
            {request.status}
          </StatusChip>
          <span className="text-label-sm text-on-surface-variant">
            Party of {request.party_size}
          </span>
        </div>

        <div className="flex items-center gap-space-sm">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-primary">
            <Icon name={venueIcon(request.venue_type)} size={22} />
          </span>
          <span className="min-w-0">
            <span className="block text-headline-sm text-on-surface">
              {sceneLabel(request.scene)}
            </span>
            <span className="block truncate text-body-sm text-on-surface-variant">
              {request.venue_name}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-space-xs text-body-md text-on-surface-variant">
          <Icon name="schedule" size={18} className="text-tertiary" />
          {formatWindow(request.window_start, request.window_end)}
          {countdown && (
            <span className="flex items-center gap-0.5 text-body-sm text-tertiary">
              <Icon name="bolt" size={14} />
              {countdown}
            </span>
          )}
        </div>

        {request.note && (
          <p className="rounded bg-surface-container-low p-space-sm text-body-sm text-on-surface-variant">
            &ldquo;{request.note}&rdquo;
          </p>
        )}

        {(request.gender_preference === "same_only" || request.require_verified) && (
          <div className="flex flex-wrap gap-space-2xs">
            {request.gender_preference === "same_only" && (
              <StatusChip tone="hot" icon="group">
                Same gender only
              </StatusChip>
            )}
            {request.require_verified && (
              <StatusChip tone="verified" icon="verified">
                Verified only
              </StatusChip>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  busy,
  onAccept,
}: {
  candidate: MeetupCandidate;
  busy: boolean;
  onAccept: () => void;
}) {
  const pct = Math.round(candidate.score * 100);

  return (
    <div className="relative overflow-hidden rounded-lg bg-surface-container p-space-md shadow-float">
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-secondary-container/15 blur-2xl" />

      <div className="relative flex items-start gap-space-sm">
        <Avatar
          name={candidate.display_name ?? "Someone"}
          seed={candidate.counterpart_user_id}
          size={48}
          ring={candidate.verified ? "verified" : "none"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-space-2xs">
            <span className="truncate text-label-lg text-on-surface">
              {candidate.display_name ?? "Someone nearby"}
            </span>
            {candidate.verified && (
              <Icon name="verified" size={16} filled className="shrink-0 text-tertiary" />
            )}
          </div>
          <div className="flex items-center gap-space-xs text-body-sm text-on-surface-variant">
            <span className="text-primary">{pct}% match</span>
            {candidate.fulfilled_count > 0 && (
              <>
                <span className="text-outline">·</span>
                <span>{candidate.fulfilled_count} kept</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Reasons — the backend explains every candidate it surfaces. */}
      {candidate.reasons.length > 0 && (
        <div className="relative mt-space-sm flex flex-wrap gap-space-2xs">
          {candidate.reasons.slice(0, 3).map((reason) => (
            <span
              key={reason}
              className="rounded-full bg-surface-container-low px-space-sm py-space-2xs text-body-sm text-on-surface-variant"
            >
              {reason}
            </span>
          ))}
        </div>
      )}

      <div className="relative mt-space-md flex gap-space-xs">
        <GlassButton className="flex-1" disabled={busy}>
          Pass
        </GlassButton>
        <GradientButton onClick={onAccept} loading={busy} className="flex-1">
          Let&apos;s go
        </GradientButton>
      </div>
    </div>
  );
}
