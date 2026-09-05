/**
 * Monad testnet deposit helper.
 *
 * Deposits are placed by calling `stake(bytes32 roomId, StakeType stakeType)` on
 * MonadMateEscrow with the MON attached as `msg.value`. The contract's
 * `receive()` deliberately reverts, so a bare transfer to the escrow address
 * would fail — wallets surface this as an un-estimatable transaction with the
 * confirm button disabled.
 *
 * Gas note: Monad charges on the **gas limit**, not on gas used, so the limit is
 * estimated once and padded only slightly. A contract call writes storage, so it
 * costs well above the 21,000 of a plain transfer.
 */
import { functionSelector } from "./keccak";
import type { DepositRequirements } from "./types";

export const MONAD_TESTNET_CHAIN_ID = 10143;
const CHAIN_ID_HEX = `0x${MONAD_TESTNET_CHAIN_ID.toString(16)}`;

/**
 * Derived at runtime rather than hardcoded.
 *
 * A wrong selector constant makes every deposit revert, and the symptom looks
 * like a wallet fault rather than a code fault. Computing it from the signature
 * means it stays correct even if the ABI changes, and it can't drift silently.
 */
const STAKE_SIGNATURE = "stake(bytes32,uint8)";

/**
 * MonadMateEscrow.StakeType. The meetup commitment maps to `MatchRequest`,
 * since the deposit backs a specific pairing rather than room access.
 */
export const STAKE_TYPE = {
  ROOM_ENTRY: 0,
  MATCH_REQUEST: 1,
  DM_UNLOCK: 2,
} as const;

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

/**
 * Pack a match UUID into the bytes32 `roomId` the contract keys its vault by.
 *
 * A UUID is 16 bytes, so it left-aligns into 32 with zero padding — collision
 * free and reversible, which keeps the on-chain vault traceable to the meetup.
 */
export function uuidToBytes32(uuid: string): string {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new DepositError("Invalid meetup id — cannot build the deposit call.");
  }
  return hex.padEnd(64, "0");
}

/** ABI-encode `stake(bytes32 roomId, uint8 stakeType)`. */
export function encodeStakeCall(matchId: string, stakeType: number): string {
  const selector = functionSelector(STAKE_SIGNATURE);
  const roomId = uuidToBytes32(matchId);
  const typeWord = stakeType.toString(16).padStart(64, "0");
  return `0x${selector}${roomId}${typeWord}`;
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
  matchId: string,
): Promise<{ txHash: string; from: string }> {
  if (!reqs.deposit_address) {
    throw new DepositError("No deposit address is configured on the server.");
  }

  const provider = getProvider();
  if (!provider) {
    throw new DepositError(
      "No wallet detected. Install MetaMask, Rabby or OKX to place a real deposit.",
    );
  }

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  const from = accounts?.[0];
  if (!from) throw new DepositError("No account was shared by the wallet.");

  await ensureMonadTestnet(provider, reqs.rpc_url);

  const value = monToWeiHex(reqs.amount_mon);
  const data = encodeStakeCall(matchId, STAKE_TYPE.MATCH_REQUEST);
  const tx = { from, to: reqs.deposit_address, value, data };

  // Estimate rather than hardcode: this is a storage-writing contract call, not
  // a 21,000-gas transfer. A failed estimate means the call would revert, so
  // surface that instead of letting the wallet disable its own confirm button.
  let gas: string;
  try {
    const estimate = (await provider.request({
      method: "eth_estimateGas",
      params: [tx],
    })) as string;
    // 20% headroom. Monad bills the limit, so this is kept tight.
    gas = `0x${((BigInt(estimate) * 12n) / 10n).toString(16)}`;
  } catch (err) {
    const message =
      (err as { message?: string })?.message ?? "unknown reason";
    throw new DepositError(
      `The deposit would be rejected on-chain (${message}). You may already ` +
        `have a deposit for this meetup.`,
    );
  }

  const txHash = (await provider.request({
    method: "eth_sendTransaction",
    params: [{ ...tx, gas }],
  })) as string;

  return { txHash, from };
}

export function explorerTxUrl(txHash: string): string {
  return `https://testnet.monadexplorer.com/tx/${txHash}`;
}
