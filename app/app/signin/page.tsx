"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/AppHeader";
import { GradientButton, GhostButton } from "@/components/Button";
import Icon from "@/components/Icon";
import { ErrorBanner } from "@/components/States";
import { api, ApiError } from "@/lib/api";
import { setSession } from "@/lib/auth";

type Step = "identify" | "code";

export default function SignInPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("identify");
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = mode === "email" ? { email: value } : { phone: value };

  async function requestCode() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.requestCode(target);
      // The backend only returns the code in development; in any other
      // environment it is delivered out of band and this stays null.
      setDevCode(res.code);
      setStep("code");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send a code.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.verifyCode({ code, ...target });
      setSession(res.access_token, res.user);
      router.replace("/");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not verify that code.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex flex-1 flex-col justify-center px-gutter-mobile pb-safe pt-safe">
      {/* Ambient glow backdrops */}
      <div className="pointer-events-none absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary-container/25 blur-[96px]" />
      <div className="pointer-events-none absolute bottom-10 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-secondary-container/20 blur-[100px]" />

      <div className="relative flex flex-col items-center gap-space-xl py-space-3xl">
        <div className="flex flex-col items-center gap-space-sm text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-surface-container shadow-beacon">
            <BrandMark size={44} />
          </div>
          <h1 className="text-display-hero-mobile text-on-surface">
            MonadMate
          </h1>
          <p className="max-w-[300px] text-body-lg text-on-surface-variant">
            Find someone to hang out with in the mall you&apos;re already in.
          </p>
        </div>

        <div className="flex w-full flex-col gap-space-md">
          {error && <ErrorBanner message={error} />}

          {step === "identify" ? (
            <>
              {/* Email / phone switch */}
              <div className="flex rounded-full bg-surface-container-low p-1">
                {(["email", "phone"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMode(m);
                      setValue("");
                    }}
                    className={`h-10 flex-1 rounded-full text-label-md capitalize transition-all ${
                      mode === m
                        ? "bg-surface-container-highest text-on-surface"
                        : "text-on-surface-variant"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <label className="flex h-[50px] items-center gap-space-sm rounded bg-surface-container-low px-space-md focus-within:border-primary-container focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.25)] border border-surface-container-high transition-all">
                <Icon
                  name={mode === "email" ? "alternate_email" : "smartphone"}
                  size={20}
                  className="text-on-surface-variant"
                />
                <input
                  type={mode === "email" ? "email" : "tel"}
                  inputMode={mode === "email" ? "email" : "tel"}
                  autoComplete={mode === "email" ? "email" : "tel"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={
                    mode === "email" ? "you@example.com" : "+86 138 0000 0000"
                  }
                  className="w-full bg-transparent text-body-md text-on-surface placeholder:text-outline focus:outline-none"
                />
              </label>

              <GradientButton
                onClick={requestCode}
                loading={busy}
                disabled={value.trim().length < 4}
                icon="arrow_forward"
              >
                Continue
              </GradientButton>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-space-2xs text-center">
                <span className="text-label-md text-on-surface">
                  Enter the 6-digit code
                </span>
                <span className="text-body-sm text-on-surface-variant">
                  Sent to {value}
                </span>
              </div>

              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="······"
                className="h-[60px] rounded bg-surface-container-low border border-surface-container-high text-center text-headline-lg tracking-[0.4em] text-on-surface placeholder:text-outline focus:border-primary-container focus:shadow-[0_0_0_3px_rgba(124,58,237,0.25)] focus:outline-none"
              />

              {devCode && (
                <div className="flex items-start gap-space-xs rounded bg-surface-container-low p-space-sm text-on-surface-variant">
                  <Icon name="code" size={18} className="mt-0.5 shrink-0 text-primary" />
                  <p className="text-body-sm">
                    Development environment — your code is{" "}
                    <strong className="font-mono text-on-surface">{devCode}</strong>.
                    In production this is never returned over HTTP.
                  </p>
                </div>
              )}

              <GradientButton
                onClick={verify}
                loading={busy}
                disabled={code.length < 4}
                icon="login"
              >
                Sign in
              </GradientButton>

              <GhostButton
                icon="arrow_back"
                onClick={() => {
                  setStep("identify");
                  setCode("");
                  setDevCode(null);
                  setError(null);
                }}
                className="self-center"
              >
                Use a different {mode}
              </GhostButton>
            </>
          )}
        </div>

        <div className="flex w-full items-center gap-space-sm">
          <span className="h-px flex-1 bg-surface-container-high" />
          <span className="text-label-sm uppercase text-outline">or</span>
          <span className="h-px flex-1 bg-surface-container-high" />
        </div>

        <div className="flex flex-col items-center gap-space-xs">
          <GhostButton
            icon="account_balance_wallet"
            onClick={() => router.push("/signin/wallet")}
          >
            Connect a wallet instead
          </GhostButton>
          <p className="flex items-center gap-space-2xs text-body-sm text-outline">
            <Icon name="lock_open" size={14} />
            No seed phrase needed.
          </p>
        </div>
      </div>
    </main>
  );
}
