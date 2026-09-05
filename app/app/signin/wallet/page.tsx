"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { GradientButton } from "@/components/Button";
import Icon from "@/components/Icon";
import { ErrorBanner } from "@/components/States";
import { api, ApiError } from "@/lib/api";
import { setSession } from "@/lib/auth";

/** Minimal EIP-1193 surface — enough for accounts + personal_sign. */
type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

function getProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const injected = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return injected ?? null;
}

export default function WalletSignInPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const provider = getProvider();
      if (!provider) {
        throw new Error(
          "No wallet detected. Install MetaMask or Rabby, or sign in with email instead.",
        );
      }

      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      const address = accounts?.[0];
      if (!address) throw new Error("No account was shared by the wallet.");

      // Challenge → sign → verify. The nonce is single-use server-side.
      const { nonce } = await api.auth.walletChallenge(address);
      const signature = (await provider.request({
        method: "personal_sign",
        params: [nonce, address],
      })) as string;

      const res = await api.auth.walletOnboard({
        wallet_address: address,
        signature,
        nonce,
      });
      setSession(res.access_token, res.user);
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else if (err instanceof Error) setError(err.message);
      else setError("Could not connect that wallet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppHeader title="Connect a wallet" back />
      <main className="flex flex-1 flex-col gap-space-xl px-gutter-mobile pb-safe pt-20">
        {error && <ErrorBanner message={error} />}

        <div className="flex flex-col items-center gap-space-sm py-space-xl text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-surface-container text-primary shadow-beacon">
            <Icon name="account_balance_wallet" size={32} />
          </div>
          <h2 className="text-headline-lg text-on-surface">Self-custody</h2>
          <p className="max-w-[300px] text-body-md text-on-surface-variant">
            Sign a message with your own wallet on Monad testnet. You keep the
            keys — MonadMate never holds them.
          </p>
        </div>

        <div className="flex flex-col gap-space-sm rounded-lg bg-surface-container p-space-lg shadow-float">
          <span className="text-label-sm uppercase tracking-wider text-on-surface-variant">
            How it works
          </span>
          {[
            {
              icon: "link",
              text: "Your wallet shares an address — no transaction, no gas.",
            },
            {
              icon: "draw",
              text: "You sign a one-time nonce to prove you control it.",
            },
            {
              icon: "verified_user",
              text: "The backend verifies the signature and starts a session.",
            },
          ].map((row) => (
            <div key={row.icon} className="flex items-start gap-space-sm">
              <Icon
                name={row.icon}
                size={18}
                className="mt-0.5 shrink-0 text-primary"
              />
              <p className="text-body-sm text-on-surface-variant">{row.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-auto flex flex-col gap-space-sm pb-space-xl">
          <GradientButton onClick={connect} loading={busy} icon="bolt">
            Connect wallet
          </GradientButton>
          <p className="text-center text-body-sm text-outline">
            Supports MetaMask, Rabby, and any EIP-1193 browser wallet.
          </p>
        </div>
      </main>
    </>
  );
}
