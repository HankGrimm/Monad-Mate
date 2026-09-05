/**
 * Types mirroring the FastAPI schemas in `backend/app/schemas/`.
 *
 * Kept hand-written rather than generated so the app compiles without a running
 * backend. If a field here drifts from the server, the API call will still
 * succeed — only the typing goes stale — so treat this file as the contract to
 * update whenever a backend schema changes.
 */

export type VenueType = "mall" | "supermarket";
export type SceneType = "dining" | "entertainment" | "shopping";
export type GenderPreference = "any" | "same_only";
export type Gender = "female" | "male" | "other" | "undisclosed";
export type WalletKind = "managed" | "external";

export type MeetupRequestStatus =
  | "open"
  | "matched"
  | "confirmed"
  | "expired"
  | "cancelled"
  | "fulfilled";

export type MeetupMatchStatus =
  | "pending"
  | "accepted"
  | "confirmed"
  | "declined"
  | "expired";

export type VerificationLevel = "none" | "wallet" | "phone" | "id" | "full";

export interface User {
  id: string;
  wallet_address: string;
  wallet_kind: WalletKind;
  did: string | null;
  gender: Gender;
  age_verified: boolean;
  verification_level: VerificationLevel;
  privacy_mode: string;
  created_at: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
  user: User;
}

export interface LoginCodeResponse {
  subject: string;
  expires_at: string;
  delivery: string;
  /** Only populated in development environments. */
  code: string | null;
}

export interface WalletAccountInfo {
  wallet_address: string;
  wallet_kind: WalletKind;
  managed: boolean;
  gas_sponsored: boolean;
  custody_disclosure: string;
}

export interface MeetupRequestCreate {
  venue_type: VenueType;
  venue_name: string;
  venue_key: string;
  scene: SceneType;
  note?: string | null;
  party_size: number;
  duration_minutes: number;
  window_start?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  gender_preference: GenderPreference;
  require_verified: boolean;
  min_reputation_score?: number | null;
}

export interface MeetupRequest {
  id: string;
  user_id: string;
  venue_type: VenueType;
  venue_name: string;
  venue_key: string;
  scene: SceneType;
  note: string | null;
  party_size: number;
  duration_minutes: number;
  window_start: string;
  window_end: string;
  gender_preference: GenderPreference;
  require_verified: boolean;
  min_reputation_score: number | null;
  status: MeetupRequestStatus;
  created_at: string;
}

export interface CandidateBreakdown {
  preference_similarity: number;
  credit_score: number;
  history_affinity: number;
  window_overlap: number;
  safety_score: number;
}

export interface MeetupCandidate {
  match_id: string | null;
  counterpart_request_id: string;
  counterpart_user_id: string;
  display_name: string | null;
  scene: SceneType;
  venue_name: string;
  score: number;
  /** Human-readable explanations of why this candidate surfaced. */
  reasons: string[];
  breakdown: Partial<CandidateBreakdown>;
  credit_score: number | null;
  fulfilled_count: number;
  verified: boolean;
}

export interface MeetupMatch {
  id: string;
  request_id: string;
  counterpart_request_id: string;
  score: number;
  reasons: string[];
  status: MeetupMatchStatus;
  requester_accepted: boolean;
  counterpart_accepted: boolean;
  created_at: string;
  confirmed_at: string | null;
}

/** What a participant may see about the other side — no identifiers. */
export interface MeetupCounterpart {
  display_name: string | null;
  verified: boolean;
  fulfilled_count: number;
  credit_score: number | null;
}

export interface MeetupMatchDetail {
  id: string;
  status: MeetupMatchStatus;
  score: number;
  reasons: string[];
  you_accepted: boolean;
  they_accepted: boolean;
  confirmed_at: string | null;
  own_request_id: string;
  venue_type: VenueType;
  venue_name: string;
  scene: SceneType;
  window_start: string;
  window_end: string;
  party_size: number;
  counterpart: MeetupCounterpart;
}

export interface Stake {
  id: string;
  amount_mon: number;
  status: string;
  stake_type: string;
  tx_hash: string | null;
  onchain_verified: boolean;
  meetup_match_id: string | null;
  explorer_url: string | null;
  created_at: string;
}

/** Where and how to send the commitment deposit. */
export interface DepositRequirements {
  chain_id: number;
  rpc_url: string;
  /** Null means on-chain deposits are not configured (demo mode). */
  deposit_address: string | null;
  amount_mon: number;
  /** Native transfers are exactly 21,000; Monad bills the limit, not usage. */
  gas_limit: number;
  onchain_required: boolean;
  explorer_base: string;
}

export interface ItineraryStep {
  minute: number;
  title: string;
  detail: string;
}

export interface MeetupPlan {
  id: string;
  match_id: string;
  venue_name: string | null;
  venue_type: string | null;
  scene: string | null;
  duration_minutes: number | null;
  party_size: number | null;
  icebreakers: string[];
  itinerary: ItineraryStep[];
  mini_game: { name?: string; how_to_play?: string };
  shared_interests: string[];
  /** `llm` when the model produced it, `template` on deterministic fallback. */
  source: "llm" | "template";
  adopted: boolean;
  created_at: string;
}

export interface VerificationStatus {
  verification_level: VerificationLevel;
  can_create_meetups: boolean;
  phone_verified: boolean;
  id_verified: boolean;
  /** True when no real identity provider is integrated. */
  id_verification_is_stub: boolean;
  next_step: "verify_phone" | "verify_id" | null;
}

export interface PhoneVerificationStart {
  phone: string;
  expires_at: string;
  delivery: string;
  code: string | null;
}

export interface IdVerificationResult {
  verification_level: VerificationLevel;
  age_verified: boolean;
  is_stub: boolean;
  disclosure: string;
}

export interface Attestation {
  id: string;
  match_id: string;
  meetup_match_id: string | null;
  method: string;
  status:
    | "initiated"
    | "pending_confirm"
    | "confirmed"
    // One side checked in and the window closed — under review, NOT a violation.
    | "pending_arbitration"
    | "failed"
    | "expired";
  token: string | null;
  initiator_confirmed: boolean;
  counterparty_confirmed: boolean;
  hcs_message_id: string | null;
  notes: string | null;
  created_at: string;
  confirmed_at: string | null;
}

export interface FulfilmentCredential {
  id: string;
  holder_id: string;
  attestation_id: string | null;
  venue_type: string | null;
  scene: string | null;
  occurred_at: string | null;
  duration_minutes: number | null;
  outcome: "kept" | "no_show" | "disputed";
  soulbound: boolean;
  token_id: string | null;
  contract_address: string | null;
  tx_hash: string | null;
  mint_status: "pending" | "minted" | "failed";
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface CredentialList {
  items: FulfilmentCredential[];
  total: number;
}

export interface Credit {
  user_id: string;
  fulfilled_count: number;
  no_show_count: number;
  disputed_count: number;
  /** False until the holder has enough fulfilment history. */
  score_available: boolean;
  credit_score: number | null;
  breakdown: Record<string, number> | null;
  required_fulfilments: number;
  /** Always states that credit is not a personal-safety guarantee. */
  disclaimer: string;
}
