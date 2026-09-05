"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { GhostButton, GlassButton, GradientButton } from "@/components/Button";
import Icon from "@/components/Icon";
import RequireAuth from "@/components/RequireAuth";
import StatusChip from "@/components/StatusChip";
import { ErrorBanner, ScreenLoader, SuccessBanner } from "@/components/States";
import { api, ApiError } from "@/lib/api";
import { updateUser } from "@/lib/auth";
import type { User, VerificationStatus } from "@/lib/types";

export default function VerificationPage() {
  return <RequireAuth>{(user) => <Verification user={user} />}</RequireAuth>;
}

function Verification({ user }: { user: User }) {
  const router = useRouter();
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStatus(await api.verification.status());
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load verification status.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!status) {
    return (
      <>
        <AppHeader title="Verification" back />
        <main className="flex flex-1 flex-col px-gutter-mobile pt-20">
          {error ? <ErrorBanner message={error} onRetry={load} /> : <ScreenLoader />}
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader title="Verification" back />
      <main className="flex flex-1 flex-col gap-space-lg px-gutter-mobile pb-space-3xl pt-20">
        {error && <ErrorBanner message={error} />}
        {notice && <SuccessBanner message={notice} />}

        {/* Current tier */}
        <div className="relative overflow-hidden rounded-lg bg-surface-container p-space-lg shadow-float">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary-container/15 blur-3xl" />
          <div className="relative flex flex-col items-center gap-space-sm text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-high">
              <Icon
                name={status.phone_verified ? "verified_user" : "badge"}
                size={30}
                filled
                className={status.phone_verified ? "text-tertiary" : "text-primary"}
              />
            </div>
            <h2 className="text-headline-md text-on-surface">
              {status.verification_level === "full"
                ? "Fully verified"
                : status.id_verified
                  ? "ID verified"
                  : status.phone_verified
                    ? "Phone verified"
                    : "Not verified"}
            </h2>
            <p className="max-w-[280px] text-body-sm text-on-surface-variant">
              {status.can_create_meetups
                ? "You can create and accept meetups."
                : "Phone verification is required before you can create or accept a meetup. This is what makes safety filters meaningful."}
            </p>
            <StatusChip
              tone={status.can_create_meetups ? "verified" : "hot"}
              icon={status.can_create_meetups ? "check_circle" : "lock"}
            >
              {status.can_create_meetups ? "Meetups unlocked" : "Meetups locked"}
            </StatusChip>
          </div>
        </div>

        {/* Step 1: Phone */}
        {!status.phone_verified && <PhoneStep onDone={load} setNotice={setNotice} setError={setError} />}

        {/* Step 2: ID (stub) */}
        {status.phone_verified && !status.id_verified && (
          <IdStep onDone={load} setNotice={setNotice} setError={setError} />
        )}

        {status.id_verified && (
          <div className="flex items-start gap-space-sm rounded bg-surface-container-low p-space-md">
            <Icon name="verified" size={20} filled className="mt-0.5 shrink-0 text-tertiary" />
            <p className="text-body-sm text-on-surface-variant">
              Both phone and ID are on file. Your profile shows a verified badge;
              credential details are never displayed to other users.
            </p>
          </div>
        )}

        <div className="mt-auto pt-space-md">
          <GhostButton icon="arrow_back" onClick={() => router.back()} className="w-full justify-center">
            Back
          </GhostButton>
        </div>
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------
// Phone verification
// ---------------------------------------------------------------------------

function PhoneStep({
  onDone,
  setNotice,
  setError,
}: {
  onDone: () => void;
  setNotice: (s: string | null) => void;
  setError: (s: string | null) => void;
}) {
  const [step, setStep] = useState<"input" | "code">("input");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.verification.startPhone(phone.trim());
      setDevCode(res.code);
      setStep("code");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send a code.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const user = await api.verification.confirmPhone(phone.trim(), code);
      updateUser(user);
      setNotice("Phone verified. You can now create and accept meetups.");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify that code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-space-sm rounded-lg bg-surface-container p-space-lg shadow-float">
      <StepHeader
        icon="smartphone"
        tone="text-primary"
        title="Verify your phone"
        subtitle="Step 1 of 2 — required to unlock meetups"
      />

      {step === "input" ? (
        <>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+86 138 0000 0000"
            className="h-[50px] rounded border border-surface-container-high bg-surface-container-low px-space-md text-body-md text-on-surface placeholder:text-outline focus:border-primary-container focus:shadow-[0_0_0_3px_rgba(124,58,237,0.25)] focus:outline-none"
          />
          <GradientButton onClick={start} loading={busy} disabled={phone.trim().length < 6} icon="sms">
            Send code
          </GradientButton>
        </>
      ) : (
        <>
          <p className="text-body-sm text-on-surface-variant">
            Enter the 6-digit code sent to <strong className="text-on-surface">{phone}</strong>
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="······"
            className="h-[56px] rounded border border-surface-container-high bg-surface-container-low text-center text-headline-lg tracking-[0.4em] text-on-surface placeholder:text-outline focus:border-primary-container focus:shadow-[0_0_0_3px_rgba(124,58,237,0.25)] focus:outline-none"
          />
          {devCode && (
            <div className="flex items-start gap-space-xs rounded bg-surface-container-low p-space-sm text-on-surface-variant">
              <Icon name="code" size={16} className="mt-0.5 shrink-0 text-primary" />
              <p className="text-body-sm">
                Development environment — your code is{" "}
                <strong className="font-mono text-on-surface">{devCode}</strong>.
              </p>
            </div>
          )}
          <GradientButton onClick={confirm} loading={busy} disabled={code.length < 4} icon="check_circle">
            Verify
          </GradientButton>
          <GhostButton
            icon="arrow_back"
            onClick={() => {
              setStep("input");
              setCode("");
              setDevCode(null);
            }}
            className="self-center"
          >
            Use a different number
          </GhostButton>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// ID verification (stub)
// ---------------------------------------------------------------------------

function IdStep({
  onDone,
  setNotice,
  setError,
}: {
  onDone: () => void;
  setNotice: (s: string | null) => void;
  setError: (s: string | null) => void;
}) {
  const [docNumber, setDocNumber] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.verification.submitId(
        docNumber.trim(),
        birthYear ? parseInt(birthYear, 10) : undefined,
      );
      setResult(res.disclosure);
      setNotice("ID tier granted (demo stub).");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-space-sm rounded-lg bg-surface-container p-space-lg shadow-float">
      <StepHeader
        icon="badge"
        tone="text-secondary"
        title="ID verification"
        subtitle="Step 2 of 2 — optional, raises your trust tier"
      />

      {/* Honesty first: this stub verifies nothing */}
      <div className="flex items-start gap-space-xs rounded bg-secondary-container/15 border border-secondary/25 p-space-sm">
        <Icon name="warning" size={18} className="mt-0.5 shrink-0 text-secondary" />
        <p className="text-body-sm text-on-surface-variant">
          <strong className="text-on-surface">Demo stub.</strong> No identity
          provider is integrated — nothing is actually checked. Only a salted hash
          of the document number is stored, never the document itself.
        </p>
      </div>

      <input
        type="text"
        value={docNumber}
        onChange={(e) => setDocNumber(e.target.value)}
        placeholder="ID document number"
        className="h-[50px] rounded border border-surface-container-high bg-surface-container-low px-space-md text-body-md text-on-surface placeholder:text-outline focus:border-primary-container focus:shadow-[0_0_0_3px_rgba(124,58,237,0.25)] focus:outline-none"
      />
      <input
        type="number"
        inputMode="numeric"
        value={birthYear}
        onChange={(e) => setBirthYear(e.target.value)}
        placeholder="Birth year (e.g. 1996)"
        min={1900}
        max={2020}
        className="h-[50px] rounded border border-surface-container-high bg-surface-container-low px-space-md text-body-md text-on-surface placeholder:text-outline focus:border-primary-container focus:shadow-[0_0_0_3px_rgba(124,58,237,0.25)] focus:outline-none"
      />
      <GradientButton
        onClick={submit}
        loading={busy}
        disabled={docNumber.trim().length < 6}
        icon="verified_user"
      >
        Submit ID
      </GradientButton>

      {result && (
        <p className="rounded bg-surface-container-low p-space-sm text-body-sm text-on-surface-variant">
          {result}
        </p>
      )}
    </section>
  );
}

function StepHeader({
  icon,
  tone,
  title,
  subtitle,
}: {
  icon: string;
  tone: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-space-sm">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-container-high ${tone}`}>
        <Icon name={icon} size={22} />
      </span>
      <div className="min-w-0">
        <span className="block text-label-lg text-on-surface">{title}</span>
        <span className="block text-body-sm text-on-surface-variant">{subtitle}</span>
      </div>
    </div>
  );
}
