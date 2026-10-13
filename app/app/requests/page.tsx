"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { GradientButton } from "@/components/Button";
import Icon from "@/components/Icon";
import RequireAuth from "@/components/RequireAuth";
import StatusChip from "@/components/StatusChip";
import { EmptyState, ErrorBanner, ScreenLoader } from "@/components/States";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatWindow, sceneIcon, sceneLabel } from "@/lib/format";
import type { MeetupRequest, MeetupRequestStatus } from "@/lib/types";

const TONES: Record<MeetupRequestStatus, "brand" | "verified" | "neutral" | "hot"> = {
  open: "brand",
  matched: "hot",
  confirmed: "verified",
  fulfilled: "verified",
  expired: "neutral",
  cancelled: "neutral",
};

const STATUS_LABELS: Record<MeetupRequestStatus, string> = {
  open: "Looking",
  matched: "Match found",
  confirmed: "Confirmed",
  fulfilled: "Completed",
  expired: "Expired",
  cancelled: "Cancelled",
};

export default function RequestsPage() {
  return <RequireAuth>{() => <RequestList />}</RequireAuth>;
}

function RequestList() {
  const [requests, setRequests] = useState<MeetupRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setRequests(await api.meetups.listMine());
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load your requests.",
      );
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const live = requests?.filter(
    (r) => r.status === "open" || r.status === "matched" || r.status === "confirmed",
  );
  const past = requests?.filter(
    (r) => r.status === "expired" || r.status === "cancelled" || r.status === "fulfilled",
  );

  return (
    <>
      <AppHeader title="MonadMate" subtitle="Requests" />

      <main className="flex flex-1 flex-col gap-space-lg px-gutter-mobile pb-28 pt-20">
        {error && <ErrorBanner message={error} onRetry={load} />}

        {requests === null && !error ? (
          <ScreenLoader label="Loading your requests" />
        ) : requests && requests.length === 0 ? (
          <EmptyState
            icon="forum"
            title="No requests yet"
            body="Post what you want to do in the next hour and MonadMate will look for someone at the same venue."
            action={
              <Link href="/">
                <GradientButton icon="add">Post an intent</GradientButton>
              </Link>
            }
          />
        ) : (
          <>
            {live && live.length > 0 && (
              <section
                className="flex flex-col gap-space-sm"
                aria-labelledby="active-requests-heading"
              >
                <div className="flex items-baseline justify-between px-space-2xs">
                  <h2 id="active-requests-heading" className="text-label-lg text-on-surface">
                    Active
                  </h2>
                  <span className="text-body-sm text-on-surface-variant">
                    {live.length} {live.length === 1 ? "request" : "requests"}
                  </span>
                </div>
                {live.map((r) => (
                  <RequestCard key={r.id} request={r} />
                ))}
              </section>
            )}

            {past && past.length > 0 && (
              <section
                className="flex flex-col gap-space-sm"
                aria-labelledby="past-requests-heading"
              >
                <div className="flex items-baseline justify-between px-space-2xs">
                  <h2 id="past-requests-heading" className="text-label-lg text-on-surface">
                    Past
                  </h2>
                  <span className="text-body-sm text-on-surface-variant">
                    {past.length} {past.length === 1 ? "request" : "requests"}
                  </span>
                </div>
                {past.map((r) => (
                  <RequestCard key={r.id} request={r} muted />
                ))}
              </section>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </>
  );
}

function RequestCard({
  request,
  muted = false,
}: {
  request: MeetupRequest;
  muted?: boolean;
}) {
  return (
    <Link
      href={`/requests/${request.id}`}
      aria-label={`${sceneLabel(request.scene)} at ${request.venue_name}, ${STATUS_LABELS[request.status]}`}
      className={`flex items-center gap-space-sm rounded-lg p-space-md transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        muted
          ? "border border-surface-container-high bg-surface-container-low/70 hover:bg-surface-container"
          : "bg-surface-container shadow-float hover:bg-surface-container-high"
      }`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-primary">
        <Icon name={sceneIcon(request.scene)} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-label-lg text-on-surface">
          {sceneLabel(request.scene)}
        </span>
        <span className="block truncate text-body-sm text-on-surface-variant">
          {request.venue_name} · {formatWindow(request.window_start, request.window_end)}
        </span>
        <span className="block text-body-sm text-outline">
          {formatDate(request.created_at)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-space-2xs">
        <StatusChip tone={TONES[request.status]} pulse={request.status === "open"}>
          {STATUS_LABELS[request.status]}
        </StatusChip>
        <Icon name="chevron_right" size={18} className="text-outline" />
      </span>
    </Link>
  );
}
