# Monad Mate — Instant Offline Companions on Monad

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-451%20passing-brightgreen)](backend/tests/)
[![Deployed](https://img.shields.io/badge/API-live%20on%20Railway-blue)](https://monad-mate-trust-api-production.up.railway.app/health)

> **Submission description (≤300 chars):** Monad Mate — post what you want to do in the next hour, match with someone in the same mall, and a small MON deposit keeps you both honest. AI matching, GPS check-in, soulbound fulfilment credentials on Monad.

**Monad Mate matches people who are in the same mall or supermarket right now and want to do the same thing in the next hour.**

You post an intent — a meal, an arcade round, a shopping run — scoped to the venue you're standing in and the time you have free. An AI agent ranks people who share that venue, that window, and that intent, and explains why each one surfaced. Both sides confirm, both put up a small MON deposit as a commitment to their own attendance, and a GPS or QR check-in returns the deposits and mints a soulbound credential recording that you kept your word.

---

## The Problem

You're alone in a mall on a Saturday and want company for the next hour. Existing social apps match you with someone across the city for some unspecified future date. By the time a chat warms up, the moment is gone — and when plans do form, there's no cost to ghosting.

## The Solution

Three constraints that most social apps don't impose:

- **Same venue, same hour** — candidates must share the building and an overlapping time window. Nothing else qualifies.
- **A commitment deposit** — both sides escrow MON as a promise about their *own* attendance. Not a bet on the other person.
- **A record that survives** — a soulbound credential logs venue category, scene, and outcome. It never records who you met.

---

## Features

### Onboarding — Two Paths
- **Managed accounts** — email or phone login provisions an account with no seed phrase and no gas prompts (`/v1/wallet/login/code`). Custodial by design; the disclosure ships in every response.
- **Self-custody** — EIP-191 wallet signature login (MetaMask, Rabby) as before. Managed users can link an external wallet to graduate.
- Verification tiers: wallet → phone → ID → full KYC. Verification is required before creating or accepting a meetup.

### Meetup Requests (R1)
- Venue types: `mall`, `supermarket`; scenes: `dining`, `entertainment`, `shopping`
- Anchored to a stable `venue_key` (POI id) — same key means same building, which beats a GPS radius indoors
- Explicit time window derived from a duration (15–240 min)
- One active request per user; windows auto-expire

### AI Match Agent (R2 / R11)
Ranking weights:

| Signal | Weight |
|--------|-------|
| Preference similarity (embeddings) | 30% |
| Fulfilment credit | 25% |
| Scene & time-slot habit overlap | 20% |
| Time-window overlap | 15% |
| Safety signal | 10% |

- Hard constraints first: same venue, same scene, overlapping window, not blocked (bidirectional), safety preferences satisfied **in both directions**
- Habit overlap (R11) only activates once both sides have ≥3 fulfilments — new users are never penalised for having no history
- Every candidate ships with human-readable `reasons`; an empty venue returns an empty list rather than padded suggestions

### Safety Preferences (R10)
`same_gender_only`, `require_verified`, and `min_reputation_score` are **hard filters, not soft ranking signals** — a candidate failing any of them is never shown. Preferences apply in both directions: if the candidate requires same-gender and you aren't, they're excluded from *your* results too.

### Commitment Deposit
- Fixed MON deposit into `MonadMateEscrow`, vault-keyed per `(staker, room_id)`
- Returned automatically once both sides check in
- A one-sided check-in marks the meetup for review rather than instantly convicting anyone

### Meetup Attestation
- Both parties submit GPS; proximity verified within 100m (haversine)
- Alternatives: BLE token (2-min TTL) or QR code (5-min TTL)
- Confirmed attestation → deposit released, reputation updated, Hedera HCS anchor, credential minted

### Soulbound Fulfilment Credentials (R8)
- `MonadMateFulfilmentSBT` — every transfer, approval, and `setApprovalForAll` path reverts
- On-chain metadata: venue category, scene, timestamp, duration, outcome. **No counterparty identity, ever.**
- `correctOutcome` exists deliberately: an immutable wrong verdict is worse than no record, so arbitration can amend an outcome with the history preserved in events

### Follow-Through Credit (R9)
- Built from real credential outcomes: `50 + kept×8 − no_show×15 − disputed×3`, clamped to 0–100
- **Hidden until 5 fulfilments exist** — no meaningless default score
- Every response carries the caveat that credit describes past follow-through and is *not* a personal-safety guarantee
- No public leaderboard or comparative ranking

### Safety & Moderation
- Report categories: harassment, fake profile, underage, spam, no-show, scam
- Underage reports → immediate deactivation; 3+ reports → repeat-offender handling
- Bidirectional blocks enforced at discovery, matching, and messaging
- All resolved reports feed the offender's reputation

---

## Architecture

```
backend/app/
  api/          ← FastAPI routes (meetups, credentials, wallet, rooms, stakes, safety…)
  models/       ← SQLAlchemy ORM (User, MeetupRequest, FulfilmentCredential, CreditProfile…)
  schemas/      ← Pydantic v2 request/response schemas
  services/     ← Business logic (30 service classes)
  core/         ← Config, JWT auth, DB pool, domain errors
  tasks/        ← Celery workers (deposit review, match expiry, reputation decay)

contracts/
  src/MonadMateEscrow.sol         ← Commitment deposit escrow (stake/refund/slash)
  src/MonadMateEventLog.sol       ← On-chain decision record log
  src/MonadMateFulfilmentSBT.sol  ← Soulbound fulfilment credential
  test/                           ← Foundry (Solidity) tests
  scripts/deploy_testnet.sh       ← One-command Monad testnet deploy
```

### Key Flow

```
Post intent → AI ranks same-venue candidates → both confirm → deposit escrowed
  → meet offline → GPS/QR check-in → deposit returned → soulbound credential minted
```



**Infrastructure primitives** (via Agent-402):
- **Monad escrow** — on-chain stake funding and release (native MON)
- **Hedera HCS** — immutable audit log for attestations and safety decisions
- **ZeroDB** — vector memory for AI preference matching
- **X402** — HTTP payment protocol for stake transactions

### Celery Background Workers

Three worker queues run independently of the API process:

| Task file | Schedule | What it does |
|-----------|----------|-------------|
| `tasks/escrow_tasks.py` | Every 1 hour | Evaluates pending stakes: refund confirmed meetups, slash no-shows (50% first, 100% repeat), update reputation |
| `tasks/match_tasks.py` | Every 15 min | Expires unaccepted match requests after TTL, sends AI-generated intro for new matches |
| `tasks/reputation_tasks.py` | Every 24 hours | Applies time-decay: −1pt/week per dimension for inactive users |

Start the worker + beat scheduler:
```bash
celery -A app.tasks.celery_app worker --loglevel=info
celery -A app.tasks.celery_app beat --loglevel=info
```

### Escrow Contract Architecture

`MonadMateEscrow` stores stake funds in a vault mapping keyed by:

```
Vault key: keccak256("stake_vault", staker, roomId)
```

This means each (user, room) pair has its own on-chain vault. The contract exposes three entry points:

| Function | Authority | Effect |
|-------------|-----------|--------|
| `stake()` | Staker | Send native MON into the escrow vault (`payable`) |
| `refund()` | `admin` (API) | Release full stake back to staker |
| `slash()` | `admin` (API) | Transfer slash % to safety fund, remainder to staker |

Alongside it, `MonadMateEventLog` records every stake/refund/slash decision as an
indexed event. The API writes to it from `monad_service.py` via web3.py, so each
call produces an explorer-visible transaction hash.

### Soulbound Credential Contract

`MonadMateFulfilmentSBT` is intentionally *not* a full ERC-721. It advertises the
ERC-721 metadata interface so wallets display it, but `transferFrom`,
`safeTransferFrom`, `approve`, and `setApprovalForAll` all revert with
`SoulboundTransferRejected`. There is no code path that moves a credential.

| Function | Authority | Effect |
|----------|-----------|--------|
| `mint()` | `admin` (API) | Issue one credential; idempotent per `attestationRef` |
| `correctOutcome()` | `admin` (API) | Amend an outcome after arbitration, emitting the prior value |
| `keptCount()` | anyone | How many credentials the holder kept |

`correctOutcome` is deliberate. A soulbound record that cannot be corrected turns
an arbitration mistake into a permanent one, so the contract keeps the amendment
path and preserves history in events rather than in stale storage.

### Ranking Signals

Candidate ranking combines five signals (see `meetup_request_service.py`):

| Signal | Weight | Source |
|--------|-------|--------|
| Preference similarity | 30% | Embedding cosine; 0.5 neutral for new users |
| Fulfilment credit | 25% | `CreditProfile.credit_score` |
| Habit affinity | 20% | Scene + time-slot frequency overlap, gated at ≥3 fulfilments each |
| Window overlap | 15% | Overlapping minutes ÷ requested duration |
| Safety | 10% | Reputation safety score minus no-show rate |

Hard constraints are applied before ranking and are never traded off against
score: same `venue_key`, same scene, overlapping window, both requests open,
neither party blocked (checked in both directions), and both sides' R10
preferences satisfied.

### Preference Embedding Algorithm

Embeddings come from AINative's 768-dim BAAI/bge model when configured, and fall
back to a pure-Python bag-of-words vector otherwise:

1. **Vocabulary**: 45 curated terms across interest categories
2. **Encoding**: Each preference list → binary vector of length 45
3. **Normalisation**: L2-norm (unit vector) to eliminate length bias
4. **Similarity**: Dot product of two unit vectors = cosine similarity

The fallback runs in microseconds with no external dependency and no model
download. See `services/preference_memory_service.py`.

### Managed Wallet Derivation

Managed accounts derive their signing key as
`HMAC-SHA256(SECRET_KEY, "monadmate/managed-wallet/v1:" + subject)`, where
subject is `email:<addr>` or `phone:<number>`.

Consequences worth knowing before deploying:

- **Custodial.** The operator can sign for these accounts. Every wallet response
  includes a `custody_disclosure` field stating this.
- **Keys are never persisted or returned.** They are derived on demand and dropped.
- **Rotating `SECRET_KEY` rotates every managed address**, so a rotation is a data
  migration, not a config change.
- **Login codes are single-use with a 5-minute TTL** and only appear in the HTTP
  response when `ENVIRONMENT` is development/test/local.
- The in-memory code store assumes one API process; use Redis before scaling out.

Users can leave custody at any time via `POST /v1/wallet/link-external`, which
requires a valid EIP-191 signature from the external address.

### Block System

`sm_blocks` table stores bidirectional block relationships. Enforcement happens at multiple layers:

- **Room discovery**: blocked users never appear in room listings
- **Match requests**: blocked users cannot initiate or receive match requests
- **Meetup candidates**: blocks filter in both directions — blocking someone also hides you from them
- **Messaging**: messages from blocked users are rejected at the API layer
- **Match agent**: vibe filter excludes blocked users from all recommendations

The `interaction_policy_service.py` centralises these checks so each endpoint doesn't need to reimplement block logic.

---

## Landing Page

The `landing/` directory contains a Next.js landing page with:
- Hero section with animated phone mockup
- How-it-works 6-step flow
- Feature grid (8 capabilities)
- Tech stack overview
- Web dApp / PWA download CTAs
- Open source section with planned packages

```bash
cd landing
npm install
npm run dev   # http://localhost:3000
npm run build # static export to landing/out/
```

PWA manifest at `landing/public/manifest.json` — Monad Mate is installable as an app via "Add to Home Screen" on any mobile browser.

For distribution steps (PWA install + APK sideload), see `docs/deployment/DISTRIBUTION.md`.

---

## Quick Start

```bash
# Clone and configure
git clone https://github.com/HankGrimm/monad-mate-trust-api
cd monad-mate-trust-api
cp .env.example .env  # fill in DATABASE_URL, SECRET_KEY, MONAD_RPC_URL

# Install and run
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
# → API docs at http://localhost:8000/docs
```

### Docker (full stack)

```bash
cd backend
docker-compose up
# Starts: API, Postgres, Redis, Celery worker, Celery beat
```

### Run Demo Seed

```bash
python3 scripts/demo_seed.py --base-url http://localhost:8000
# Seeds 4 users, 3 rooms, a match, messages, attestation, and a harassment report
```

---

## Monad Contracts — Not Yet Deployed

The escrow, event-log, and credential contracts live in `contracts/` and are ready
to deploy to Monad testnet (chain id `10143`). No address is published yet —
deploy them and copy the printed addresses into `.env`:

```bash
cd contracts
forge install foundry-rs/forge-std
forge test
export MONAD_RPC_URL=https://testnet-rpc.monad.xyz
export MONAD_DEPLOYER_KEY=0x...
bash scripts/deploy_testnet.sh
```

Once `MONAD_EVENT_LOG_ADDRESS` is set, every stake, refund, and slash from the API
submits a transaction and returns a hash viewable on https://testnet.monadexplorer.com.

---

## What We Built vs. What We Built On

### Built on Agent402 / infrastructure primitives

Monad Mate integrates several infrastructure layers through the Agent402 / AINative ecosystem rather than rebuilding them:

| Primitive | Provider | How we use it |
|-----------|---------|--------------|
| On-chain stake escrow | **MonadMateEscrow** (native MON) | Fund, hold, release, and slash stakes on Monad |
| Immutable audit trail | **Hedera HCS** (via Agent402) | Anchor every attestation and safety decision on-chain |
| LLM inference | **AINative Studio API** | `claude-sonnet-4-5` intro generation, `llama-3.3-8b` message moderation |
| Vector embeddings | **AINative ZeroDB** | 768-dim BAAI/bge embeddings at 16ms; semantic cross-user search |
| On-chain payments | **Coinbase x402** (Base) | HTTP 402 payment gate for DM unlock staking |

### Built uniquely for Monad Mate

Everything below was designed and built from scratch for this project:

| Component | Location | What's unique |
|-----------|---------|--------------|
| **Same-venue meetup matching** | `backend/app/services/meetup_request_service.py` | Venue-key + time-window + scene hard constraints, 5-signal ranking, explainable reasons, empty-when-nothing-qualifies |
| **Bidirectional safety filters** | `backend/app/services/meetup_request_service.py` | Same-gender / verified-only / min-reputation applied as hard filters in both directions, never as soft ranking |
| **Soulbound credential contract** | `contracts/src/MonadMateFulfilmentSBT.sol` | All transfer paths revert; metadata carries no counterparty; `correctOutcome` keeps arbitration mistakes fixable |
| **Managed wallet onboarding** | `backend/app/services/managed_wallet_service.py` | Deterministic HMAC key derivation, keys never persisted, single-use login codes, disclosed custody, self-custody exit path |
| **Fulfilment credit** | `backend/app/services/fulfilment_credential_service.py` | Score gated behind 5 fulfilments, habit maps feed matching, safety caveat on every response |
| **Commitment deposit escrow** | `contracts/src/MonadMateEscrow.sol` | mapping-keyed vault per `(staker, room_id)`, slash splits to safety fund |
| **Proximity attestation** | `backend/app/services/meetup_attestation_service.py` | GPS haversine (100m threshold) + BLE token + QR fallback; both parties must confirm |
| **5-dimension reputation engine** | `backend/app/services/social_reputation_service.py` | Weighted composite, event-driven updates, time decay |
| **Repeat-offender detection** | `backend/app/services/safety_service.py` | 3+ reports → automatic suspension, HCS anchor |

---

## Open Source Strategy — Three Packages, Live Now

Monad Mate's three core primitives have been extracted as standalone, dependency-injection-friendly PyPI packages. Each works without any external service configured (graceful no-ops throughout).

| Package | Install | What it does |
|---------|---------|-------------|
| **[`monadmate-stake-sdk`](packages/monadmate-stake-sdk/)** | `pip install monadmate-stake-sdk` | Stake-gated access control — `StakeGate`, `StakeRecord`, `SlashingPolicy`. Any Monad dApp can require MON before a DM, room entry, or action. No-show multiplier built in. |
| **[`monadmate-reputation`](packages/monadmate-reputation/)** | `pip install monadmate-reputation` | 5-dimension portable reputation scoring with time-based decay and Hedera HCS anchoring. Framework-agnostic — bring your own storage. |
| **[`x402-monad`](packages/x402-monad/)** | `pip install x402-monad` | FastAPI middleware for Coinbase x402 HTTP payments on Base. Drop-in `require_x402_payment()` dependency for any endpoint. |

All three are MIT licensed and located in `packages/`. They don't depend on each other — use one, two, or all three.

```bash
# Quick example: add stake-gating to your app in 5 lines
from monadmate_stake_sdk import StakeGate, StakeType

gate = StakeGate()
ok, error = gate.validate(StakeType.DM, amount_mon=0.50, no_show_count=0)
record = gate.create_stake(user_id="0xABC", stake_type=StakeType.DM, amount_mon=0.50)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get involved.

---

## Tests

```bash
cd backend
pytest tests/ -v --cov=app --cov-report=term-missing
```

**451 tests passing.**

| Area | Tests |
|------|-------|
| Meetup requests (R1 / R10 / R11) | 23 |
| Fulfilment credentials & credit (R8 / R9) | 12 |
| Managed wallet onboarding | 14 |
| New route HTTP layer | 18 |
| User / Wallet Auth | 25 |
| Safety & Moderation | 23 |
| Stakes & Escrow | 19 |
| Proximity Verification | 16 |
| Preference Memory | 16 |
| Matching & Messaging | 15 |
| Room Discovery | 14 |
| Reputation & Decay | 17 |
| Rooms | 9 |
| AI Match Agent | 8 |
| Infra / Health | 11 |

Contract tests live in `contracts/test/` and run with `forge test` (requires
Foundry, which is not installed in this workspace — the Solidity suite has not
been executed here).

---

## Integrations

### Coinbase x402 — HTTP Payment Protocol (Base)

Monad Mate implements the [x402 HTTP payment protocol](https://x402.org) on Base mainnet for DM unlock staking.

**How it works:**

```
Client → POST /api/v1/stakes (stake_type=dm, no payment)
Server → 402 Payment Required + payment requirements (Base MON)
Client → pays 0.5 USDC on Base via Coinbase facilitator
Client → POST /api/v1/stakes (X-Payment: <proof>)
Server → verifies proof via https://x402.org/facilitator/verify
Server → 201 Created (stake unlocked)
```

**Payment details:**
- Network: Base mainnet
- Asset: MON (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)
- Amount: 0.5 USDC (500,000 micro-units, 6 decimals)
- Facilitator: Coinbase public facilitator (`https://x402.org/facilitator`)

**Enable in `.env`:**

```env
X402_ENABLED=true
COINBASE_PAYMENT_ADDRESS=0xYourBaseWalletAddress
```

**Disabled by default** — all existing tests pass without any x402 configuration. When the facilitator is unreachable, requests are allowed through (graceful degradation).

**Implementation:**
- Middleware: `backend/app/middleware/x402_payment.py`
- Dependency: `require_x402_payment` (called inline for `stake_type=dm` only)
- Package: `x402[fastapi]==2.9.0`

---

## Running Locally — API Keys Setup

Monad Mate is designed to run without external API keys in development. All third-party integrations (Hedera, ZeroDB) **gracefully no-op** when credentials are missing — the API still starts and all tests pass.

### Minimum setup (no external services)

```bash
cp .env.example .env
```

Edit `.env` with just these two required values:

```env
# Required — always
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/monadmate
# Also derives managed wallet addresses — see "Managed Wallet Derivation" above
SECRET_KEY=any-random-string-at-least-32-chars

# Optional — app starts fine without these
```

That's it. Wallet auth, managed-wallet login, meetup matching, AI scoring, credentials, and all 451 tests work without any third-party keys.

---

### Optional integrations

Each integration below adds a real capability. Skip any you don't need.

#### Monad (on-chain deposits + credentials)
Add Monad testnet to your wallet and fund it from the faucet: https://faucet.monad.xyz

```env
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_CHAIN_ID=10143
MONAD_ESCROW_ADDRESS=<from: cd contracts && bash scripts/deploy_testnet.sh>
MONAD_EVENT_LOG_ADDRESS=<from the same deploy output>
MONAD_CREDENTIAL_SBT_ADDRESS=<from the same deploy output>
MONAD_PRIVATE_KEY=<backend authority key — only this key can refund/slash/mint>
```

> Without these, credentials are still recorded in Postgres but stay in `pending` mint status.

#### Hedera HCS (immutable audit trail)
Sign up at https://portal.hedera.com — testnet accounts are free.

```env
HEDERA_ACCOUNT_ID=0.0.XXXXXX
HEDERA_PRIVATE_KEY=302e...               # ED25519 private key from portal
HEDERA_TOPIC_ID=0.0.XXXXXX              # create via: hedera topic create
HEDERA_NETWORK=testnet                  # or "mainnet"
```

> Without these, attestation anchoring and safety audit calls are silently skipped. The `hcs_message_id` field stays null on attestations.

#### ZeroDB (vector memory for AI matching)
Get a free API key at https://ainative.studio

```env
ZERODB_API_KEY=<your-key>
ZERODB_PROJECT_ID=<your-project-id>
ZERODB_API_URL=https://api.ainative.studio  # default
```

> Without these, preference embeddings are stored only in Postgres (the built-in bag-of-words scoring still works). Semantic search across all users won't be available.

#### OpenAI (enhanced intro generation)
```env
OPENAI_API_KEY=sk-...
```

> Without this, the AI intro generator uses the built-in template engine.

---

### Full `.env` reference

```env
# ── Required ──────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/monadmate
SECRET_KEY=change-me-to-a-long-random-secret
# Controls whether managed-wallet login codes are returned over HTTP
ENVIRONMENT=development

# ── Monad ────────────────────────────────────────────────────────────────────
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_CHAIN_ID=10143
MONAD_ESCROW_ADDRESS=
MONAD_EVENT_LOG_ADDRESS=
MONAD_CREDENTIAL_SBT_ADDRESS=
MONAD_PRIVATE_KEY=

# ── Hedera HCS ────────────────────────────────────────────────────────────────
HEDERA_ACCOUNT_ID=
HEDERA_PRIVATE_KEY=
HEDERA_TOPIC_ID=
HEDERA_NETWORK=testnet

# ── ZeroDB ────────────────────────────────────────────────────────────────────
ZERODB_API_KEY=
ZERODB_PROJECT_ID=
ZERODB_API_URL=https://api.ainative.studio

# ── OpenAI (optional) ─────────────────────────────────────────────────────────
OPENAI_API_KEY=

# ── Stake thresholds (MON) ───────────────────────────────────────────────────
MIN_STAKE_ROOM_MON=1.0
MIN_STAKE_MEETUP_MON=2.0
MIN_STAKE_DM_MON=0.5

# ── Celery / Redis (for background workers) ───────────────────────────────────
REDIS_URL=redis://localhost:6379/0
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** | Postgres connection string |
| `SECRET_KEY` | **Yes** | JWT signing secret (32+ chars); also derives managed wallet addresses |
| `ENVIRONMENT` | No | `development`/`test`/`local` returns managed login codes in the response; anything else withholds them |
| `MONAD_RPC_URL` | No | Monad RPC endpoint (default: `https://testnet-rpc.monad.xyz`) |
| `MONAD_CHAIN_ID` | No | Monad chain id (default: `10143`, testnet) |
| `MONAD_ESCROW_ADDRESS` | No | Deployed `MonadMateEscrow` address |
| `MONAD_EVENT_LOG_ADDRESS` | No | Deployed `MonadMateEventLog` address |
| `MONAD_CREDENTIAL_SBT_ADDRESS` | No | Deployed `MonadMateFulfilmentSBT` address |
| `MONAD_PRIVATE_KEY` | No | Backend authority key for refund/slash, event-log writes, and credential minting |
| `HEDERA_ACCOUNT_ID` | No | Hedera operator account (e.g. `0.0.12345`) |
| `HEDERA_PRIVATE_KEY` | No | Hedera ED25519 private key |
| `HEDERA_TOPIC_ID` | No | HCS topic ID for audit logs |
| `HEDERA_NETWORK` | No | `testnet` or `mainnet` (default: testnet) |
| `ZERODB_API_KEY` | No | ZeroDB vector memory API key |
| `ZERODB_PROJECT_ID` | No | ZeroDB project identifier |
| `ZERODB_API_URL` | No | ZeroDB base URL (default: `https://api.ainative.studio`) |
| `OPENAI_API_KEY` | No | OpenAI key for enhanced intro generation |
| `REDIS_URL` | No | Redis URL for Celery workers (default: `redis://localhost:6379/0`) |
| `MIN_STAKE_ROOM_MON` | No | Min MON stake for room entry (default: 1.0) |
| `MIN_STAKE_MEETUP_MON` | No | Min MON stake for meetup request (default: 2.0) |
| `MIN_STAKE_DM_MON` | No | Min MON stake to unlock DMs (default: 0.5) |
| `X402_ENABLED` | No | Enable Coinbase x402 payment gate on DM unlock (default: false) |
| `COINBASE_PAYMENT_ADDRESS` | No | Base wallet address to receive x402 USDC payments |

