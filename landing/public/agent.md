# MonadMate — Machine-Readable Agent Guide

## Overview

MonadMate matches people who are in the same mall or supermarket right now and want to do the same thing in the next hour. Matching is constrained to the same venue and an overlapping time window; a small MON commitment deposit and a soulbound fulfilment credential make attendance meaningful.

## Core APIs

**Authentication** — Two paths: passwordless email/phone code (managed custodial account, no seed phrase or gas) or EIP-191 wallet signature challenge. Both return a JWT bearer token.

**Meetup requests** — Post an on-site intent scoped to a venue, scene, and time window.

**Candidates** — Ranked same-venue candidates with human-readable reasons. Empty when nothing qualifies.

**Confirmation** — Two-sided handshake; either party can pass with no credit impact.

**Deposits** — Escrow MON as a commitment to your own attendance; refunded on mutual check-in.

**Attestations** — GPS, BLE, or QR meetup check-in requiring both parties.

**Credentials** — Soulbound fulfilment records; metadata excludes the counterparty.

**Credit** — Follow-through score, gated behind 5 fulfilments, never a safety guarantee.

**Safety** — Reports, bidirectional blocks, and hard preference filters (same-gender-only, verified-only, minimum reputation).

## API Base
```
http://localhost:9999/api
```

## Authentication
JWT. Either a managed login code exchange or a wallet signature challenge.
Header: `Authorization: Bearer <token>`

## Key Endpoints
```
POST /v1/wallet/login/code                              Request login code
POST /v1/wallet/login/verify                            Exchange code for session
GET  /v1/wallet/me                                      Wallet state + custody disclosure
POST /v1/wallet/link-external                           Move to self-custody
POST /v1/users/challenge                                Wallet nonce challenge
POST /v1/users/onboard                                  Verify signature, return JWT
PATCH /v1/users/me                                      Set gender / birth year
POST /v1/meetups/requests                               Post a meetup intent
GET  /v1/meetups/requests                               List my requests
GET  /v1/meetups/requests/{id}/candidates               Ranked candidates
POST /v1/meetups/requests/{id}/propose/{other_id}       Accept a candidate
GET  /v1/meetups/requests/{id}/matches                  List pairings
POST /v1/meetups/matches/{id}/respond                   Accept or pass
POST /v1/meetups/requests/{id}/cancel                   Withdraw
POST /v1/stakes                                         Escrow deposit
POST /v1/attestations/meetup/initiate                   Start check-in
POST /v1/attestations/meetup/{id}/confirm               Confirm check-in
GET  /v1/credentials/me                                 List credentials
GET  /v1/credentials/me/credit                          Follow-through credit
POST /v1/safety/report                                  File a report
POST /v1/safety/block                                   Block a user
```

## Constraints agents should respect
- Identity verification is required before creating or accepting a meetup.
- One active request per user at a time.
- Candidates must share the `venue_key`, the scene, and an overlapping window — no cross-venue matching exists.
- Safety preferences are hard filters applied in both directions; they cannot be overridden by a high score.
- Credit responses always carry a disclaimer that the score is not a personal-safety guarantee.

## SDKs
```bash
pip install monadmate-stake-sdk
pip install monadmate-reputation
pip install monadmate-x402
```

## Full details: /llms-full.txt
