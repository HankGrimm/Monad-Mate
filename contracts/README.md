# Monad Mate Contracts

Solidity contracts for the Monad Mate trust layer, built with [Foundry](https://book.getfoundry.sh/).

## Contracts

- `src/MonadMateEscrow.sol` — commitment-deposit escrow holding **native MON**.
  Users deposit MON against a meetup (`stake()` is payable, no token approval
  needed); the backend authority refunds on a confirmed check-in or slashes after
  arbitration (slashed share goes to the safety fund). Bare transfers to the
  contract are rejected — funds must enter through `stake()`.
- `src/MonadMateEventLog.sol` — append-only event log. The backend writes
  deposit/refund/slash/credential records here so each decision produces an
  explorer-visible transaction.
- `src/MonadMateFulfilmentSBT.sol` — soulbound fulfilment credential. Minted by
  the backend after a confirmed meetup; every transfer and approval entrypoint
  reverts, so the token can never move or be listed. On-chain metadata holds only
  the venue category, scene, timestamp, duration, and outcome — no counterparty
  identity. `correctOutcome()` lets arbitration amend a verdict, since an
  uncorrectable wrong record is worse than no record.

## Setup

macOS / Linux:

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
cd contracts
forge install foundry-rs/forge-std
forge build
forge test
```

Windows (PowerShell) — the shell installer needs bash, so grab the prebuilt binaries:

```powershell
$dest = "$env:LOCALAPPDATA\foundry"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Invoke-WebRequest `
  -Uri https://github.com/foundry-rs/foundry/releases/download/v1.8.1/foundry_v1.8.1_win32_amd64.zip `
  -OutFile "$env:TEMP\foundry.zip"
Expand-Archive "$env:TEMP\foundry.zip" -DestinationPath $dest -Force
# add $dest to PATH, or call the exes directly

cd contracts
git clone --depth 1 https://github.com/foundry-rs/forge-std lib/forge-std
& "$env:LOCALAPPDATA\foundry\forge.exe" build
& "$env:LOCALAPPDATA\foundry\forge.exe" test
```

`forge install` requires the project to be a git repo; the plain `git clone` above
works either way and drops forge-std where the `lib/` remapping expects it.

## Deploy to Monad testnet

```bash
export MONAD_RPC_URL=https://testnet-rpc.monad.xyz
export MONAD_DEPLOYER_KEY=0x...        # backend authority key
export MONAD_SAFETY_FUND=0x...         # optional, defaults to deployer
export MONAD_SBT_BASE_URI=https://...  # optional, credential metadata base URI
bash scripts/deploy_testnet.sh
```

The deployer address needs testnet MON for gas — get it from the faucet:
https://faucet.monad.xyz

The script prints `MONAD_ESCROW_ADDRESS`, `MONAD_EVENT_LOG_ADDRESS`, and
`MONAD_CREDENTIAL_SBT_ADDRESS` to copy into the backend `.env`.

## Notes

- Monad is EVM-equivalent, so no chain-specific opcodes or precompiles are used.
- Chain id: `10143` (testnet). Explorer: https://testnet.monadexplorer.com
- The backend must hold the `admin` key: only `admin` can call `refund` / `slash`
  or mint credentials, and only allow-listed writers can append to the event log.
