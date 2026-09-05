"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import Avatar from "@/components/Avatar";
import BottomNav from "@/components/BottomNav";
import { GradientButton } from "@/components/Button";
import Icon from "@/components/Icon";
import RequireAuth from "@/components/RequireAuth";
import StatusChip from "@/components/StatusChip";
import { ErrorBanner, ScreenLoader } from "@/components/States";
import { api, ApiError } from "@/lib/api";
import { isVerified } from "@/lib/auth";
import { formatWindow, sceneLabel } from "@/lib/format";
import type {
  GenderPreference,
  MeetupRequest,
  SceneType,
  User,
} from "@/lib/types";
import { DURATIONS, SCENES, VENUES } from "@/lib/venues";

export default function HomePage() {
  return (
    <RequireAuth>{(user) => <PostIntent user={user} />}</RequireAuth>
  );
}

function PostIntent({ user }: { user: User }) {
  const router = useRouter();

  const [venueKey, setVenueKey] = useState(VENUES[0].key);
  const [scene, setScene] = useState<SceneType>("dining");
  const [duration, setDuration] = useState(60);
  const [partySize, setPartySize] = useState(2);
  const [note, setNote] = useState("");
  const [sameGenderOnly, setSameGenderOnly] = useState(false);
  const [requireVerified, setRequireVerified] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);

  const [active, setActive] = useState<MeetupRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const venue = VENUES.find((v) => v.key === venueKey) ?? VENUES[0];
  const verified = isVerified(user);

  // The backend allows one active request at a time; surface it instead of
  // letting the user submit into a guaranteed 409.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mine = await api.meetups.listMine();
        if (cancelled) return;
        setActive(
          mine.find((r) => r.status === "open" || r.status === "matched") ?? null,
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Could not load your requests.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.meetups.create({
        venue_type: venue.type,
        venue_name: venue.name,
        venue_key: venue.key,
        scene,
        note: note.trim() || null,
        party_size: partySize,
        duration_minutes: duration,
        latitude: venue.latitude,
        longitude: venue.longitude,
        gender_preference: (sameGenderOnly
          ? "same_only"
          : "any") as GenderPreference,
        require_verified: requireVerified,
      });
      router.push(`/requests/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not post your intent.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppHeader
        title="MonadMate"
        subtitle="Right now"
        action={
          <Avatar name={user.wallet_address} seed={user.id} size={32} />
        }
      />

      <main className="flex flex-1 flex-col gap-space-xl px-gutter-mobile pb-28 pt-20">
        {loading ? (
          <ScreenLoader label="Checking for an active request" />
        ) : (
          <>
            {error && <ErrorBanner message={error} />}

            {!verified && <VerificationNotice />}

            {active && <ActiveRequestCard request={active} />}

            {/* Venue */}
            <section className="flex flex-col gap-space-sm">
              <SectionLabel icon="my_location" text="Where you are" />
              <div className="flex gap-space-sm overflow-x-auto no-scrollbar -mx-gutter-mobile px-gutter-mobile pb-1">
                {VENUES.map((v) => {
                  const selected = v.key === venueKey;
                  return (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => setVenueKey(v.key)}
                      className={`min-w-[190px] shrink-0 rounded p-space-md text-left transition-all active:scale-[0.98] ${
                        selected
                          ? "bg-surface-container-highest shadow-beacon"
                          : "bg-surface-container-low"
                      }`}
                    >
                      <div className="mb-space-2xs flex items-center gap-space-xs">
                        <Icon
                          name={v.type === "mall" ? "storefront" : "local_grocery_store"}
                          size={18}
                          className={selected ? "text-primary" : "text-on-surface-variant"}
                        />
                        {selected && (
                          <StatusChip tone="verified" pulse>
                            Here
                          </StatusChip>
                        )}
                      </div>
                      <span className="block truncate text-label-lg text-on-surface">
                        {v.name}
                      </span>
                      <span className="block truncate text-body-sm text-on-surface-variant">
                        {v.area}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Scene */}
            <section className="flex flex-col gap-space-sm">
              <SectionLabel icon="interests" text="What you want to do" />
              <div className="flex flex-col gap-space-xs">
                {SCENES.map((s) => {
                  const selected = s.value === scene;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setScene(s.value)}
                      className={`flex items-center gap-space-sm rounded p-space-md text-left transition-all active:scale-[0.99] ${
                        selected
                          ? "bg-surface-container-highest shadow-beacon"
                          : "bg-surface-container-low"
                      }`}
                    >
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                          selected
                            ? "bg-gradient-to-br from-primary-container to-secondary-container text-white"
                            : "bg-surface-container-high text-on-surface-variant"
                        }`}
                      >
                        <Icon name={s.icon} size={22} filled={selected} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-label-lg text-on-surface">
                          {s.label}
                        </span>
                        <span className="block text-body-sm text-on-surface-variant">
                          {s.hint}
                        </span>
                      </span>
                      {selected && (
                        <Icon name="check_circle" size={20} filled className="text-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Duration + party size */}
            <section className="flex flex-col gap-space-sm">
              <SectionLabel icon="schedule" text="How long you have" />
              <div className="flex gap-space-xs">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={`h-11 flex-1 rounded-full text-label-md transition-all active:scale-95 ${
                      duration === d
                        ? "bg-surface-container-highest text-on-surface shadow-beacon"
                        : "bg-surface-container-low text-on-surface-variant"
                    }`}
                  >
                    {d < 60 ? `${d} min` : `${d / 60} hr`}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between rounded bg-surface-container-low p-space-md">
                <span className="flex items-center gap-space-xs text-label-lg text-on-surface">
                  <Icon name="group" size={20} className="text-on-surface-variant" />
                  Party size
                </span>
                <div className="flex items-center gap-space-sm">
                  <Stepper
                    icon="remove"
                    onClick={() => setPartySize((n) => Math.max(2, n - 1))}
                    disabled={partySize <= 2}
                  />
                  <span className="w-6 text-center text-headline-sm text-on-surface">
                    {partySize}
                  </span>
                  <Stepper
                    icon="add"
                    onClick={() => setPartySize((n) => Math.min(4, n + 1))}
                    disabled={partySize >= 4}
                  />
                </div>
              </div>

              <input
                type="text"
                value={note}
                maxLength={300}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What are you in the mood for?"
                className="h-[50px] rounded border border-surface-container-high bg-surface-container-low px-space-md text-body-md text-on-surface placeholder:text-outline focus:border-primary-container focus:shadow-[0_0_0_3px_rgba(124,58,237,0.25)] focus:outline-none"
              />
            </section>

            {/* Safety preferences */}
            <section className="flex flex-col gap-space-xs">
              <button
                type="button"
                onClick={() => setSafetyOpen((o) => !o)}
                className="flex items-center justify-between rounded bg-surface-container-low p-space-md active:scale-[0.99] transition-transform"
              >
                <span className="flex items-center gap-space-sm">
                  <Icon name="shield" size={20} className="text-primary" />
                  <span className="text-label-lg text-on-surface">
                    Safety preferences
                  </span>
                </span>
                <Icon
                  name={safetyOpen ? "expand_less" : "expand_more"}
                  size={22}
                  className="text-outline"
                />
              </button>

              {safetyOpen && (
                <div className="flex animate-fade-in flex-col gap-space-xs">
                  <Toggle
                    label="Only match same gender"
                    hint={
                      user.gender === "undisclosed"
                        ? "Set your gender in Profile first"
                        : "Applied as a hard filter, both ways"
                    }
                    checked={sameGenderOnly}
                    disabled={user.gender === "undisclosed"}
                    onChange={setSameGenderOnly}
                  />
                  <Toggle
                    label="Only verified people"
                    hint="Phone, ID, or full verification"
                    checked={requireVerified}
                    onChange={setRequireVerified}
                  />
                  <p className="flex items-start gap-space-2xs px-space-xs text-body-sm text-outline">
                    <Icon name="info" size={15} className="mt-0.5 shrink-0" />
                    These are filters, not rankings. Anyone who doesn&apos;t meet
                    them is never shown.
                  </p>
                </div>
              )}
            </section>

            <div className="mt-auto flex flex-col gap-space-sm pt-space-md">
              <GradientButton
                onClick={submit}
                loading={busy}
                disabled={!verified || active !== null}
                icon="radar"
              >
                Find someone
              </GradientButton>
              {active !== null && (
                <p className="text-center text-body-sm text-outline">
                  Cancel your active request before posting a new one.
                </p>
              )}
            </div>
          </>
        )}
      </main>

      <BottomNav />
    </>
  );
}

function SectionLabel({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="flex items-center gap-space-xs px-space-2xs text-label-sm uppercase tracking-wider text-on-surface-variant">
      <Icon name={icon} size={16} />
      {text}
    </span>
  );
}

function Stepper({
  icon,
  onClick,
  disabled,
}: {
  icon: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-high text-on-surface transition-all active:scale-90 ${
        disabled ? "opacity-40 pointer-events-none" : ""
      }`}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-space-sm rounded bg-surface-container-low p-space-md ${
        disabled ? "opacity-50" : "cursor-pointer active:scale-[0.99]"
      } transition-transform`}
    >
      <span className="min-w-0">
        <span className="block text-label-md text-on-surface">{label}</span>
        <span className="block text-body-sm text-on-surface-variant">{hint}</span>
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-primary-container shadow-beacon" : "bg-surface-container-highest"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </label>
  );
}

function VerificationNotice() {
  return (
    <Link
      href="/verification"
      className="flex items-start gap-space-sm rounded bg-secondary-container/20 border border-secondary/30 p-space-md transition-transform active:scale-[0.99]"
    >
      <Icon name="badge" size={20} className="mt-0.5 shrink-0 text-secondary" />
      <div className="min-w-0 flex-1">
        <p className="text-label-md text-on-surface">Verification required</p>
        <p className="text-body-sm text-on-surface-variant">
          You need a verified phone before you can post or accept a meetup. Tap
          here to verify.
        </p>
      </div>
      <Icon name="chevron_right" size={20} className="mt-0.5 shrink-0 text-outline" />
    </Link>
  );
}

function ActiveRequestCard({ request }: { request: MeetupRequest }) {
  return (
    <a
      href={`/requests/${request.id}`}
      className="flex items-center gap-space-sm rounded-lg bg-surface-container p-space-md shadow-float active:scale-[0.99] transition-transform"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-container/20 text-primary">
        <Icon name="radar" size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-label-lg text-on-surface">
          {sceneLabel(request.scene)} · {request.venue_name}
        </span>
        <span className="block truncate text-body-sm text-on-surface-variant">
          {formatWindow(request.window_start, request.window_end)}
        </span>
      </span>
      <StatusChip tone="brand" pulse>
        {request.status}
      </StatusChip>
      <Icon name="chevron_right" size={20} className="shrink-0 text-outline" />
    </a>
  );
}
