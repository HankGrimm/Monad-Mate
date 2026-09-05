/**
 * Monad testnet deposit helper.
 *
 * Sends a native MON transfer from the user's injected wallet to the backend's
 * deposit address, switching (or adding) the Monad testnet chain first.
 *
 * Gas note: Monad charges on the **gas limit**, not on gas used. A native
 * transfer is always exactly 21,000, so the limit is hardcoded rather than
 * estimated — an inflated estimate would cost the user real MON.
 */
import type { DepositRequirements } from "./types";

export const MONAD_TESTNET_CHAIN_ID = 10143;
const CHAIN_ID_HEX = `0x${MONAD_TESTNET_CHAIN_ID.toString(16)}`;

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export function getProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { ethereum?: Eip1193Provider }).ethereum ?? null
  );
}

export function hasWallet(): boolean {
  return getProvider() !== null;
}

/** Convert a MON amount to a 0x-prefixed wei value without float drift. */
export function monToWeiHex(amount: number): string {
  // Build the wei integer from a fixed-precision decimal string so values like
  // 0.1 don't accumulate binary rounding error.
  const [whole, frac = ""] = amount.toFixed(18).split(".");
  const wei = BigInt(whole) * 10n ** 18n + BigInt(frac.padEnd(18, "0"));
  return `0x${wei.toString(16)}`;
}

async function ensureMonadTestnet(
  provider: Eip1193Provider,
  rpcUrl: string,
): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch (err) {
    // 4902 = chain unknown to the wallet; add it, then the switch is implicit.
    const code = (err as { code?: number })?.code;
    if (code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_ID_HEX,
            chainName: "Monad Testnet",
            nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
            rpcUrls: [rpcUrl],
            blockExplorerUrls: ["https://testnet.monadexplorer.com"],
          },
        ],
      });
      return;
    }
    throw err;
  }
}

export class DepositError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DepositError";
  }
}

/**
 * Send the deposit and return the transaction hash.
 *
 * The hash is returned rather than awaited to completion — the backend verifies
 * it against the chain, so the client doesn't need to poll for a receipt.
 */
export async function sendDeposit(
  reqs: DepositRequirements,
): Promise<{ txHash: string; from: string }> {
  if (!reqs.deposit_address) {
    throw new DepositError("No deposit address is configured on the server.");
  }

  const provider = getProvider();
  if (!provider) {
    throw new DepositError(
      "No wallet detected. Install MetaMask or Rabby to place a real deposit.",
    );
  }

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  const from = accounts?.[0];
  if (!from) throw new DepositError("No account was shared by the wallet.");

  await ensureMonadTestnet(provider, reqs.rpc_url);

  const txHash = (await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from,
        to: reqs.deposit_address,
        value: monToWeiHex(reqs.amount_mon),
        // Fixed: a native transfer is always 21,000 gas on Monad.
        gas: `0x${reqs.gas_limit.toString(16)}`,
      },
    ],
  })) as string;

  return { txHash, from };
}

export function explorerTxUrl(txHash: string): string {
  return `https://testnet.monadexplorer.com/tx/${txHash}`;
}
