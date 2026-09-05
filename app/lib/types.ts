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

export interface Stake {
  id: string;
  amount_mon: number;
  status: string;
  stake_type: string;
  tx_hash: string | null;
  created_at: string;
}

export interface Attestation {
  id: string;
  match_id: string;
  method: string;
  status: string;
  token: string | null;
  initiator_confirmed: boolean;
  counterparty_confirmed: boolean;
  hcs_message_id: string | null;
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
