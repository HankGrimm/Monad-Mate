/**
 * Typed client for the MonadMate FastAPI backend.
 *
 * Requests go to `/api/...` on this app's own origin and are rewritten to the
 * backend by `next.config.mjs`, so the browser never makes a cross-origin call
 * and the backend URL is never baked into the bundle.
 */
import { clearSession, getToken } from "./auth";
import type {
  Attestation,
  AuthToken,
  Credit,
  CredentialList,
  DepositRequirements,
  IdVerificationResult,
  LoginCodeResponse,
  MeetupCandidate,
  MeetupMatch,
  MeetupMatchDetail,
  MeetupPlan,
  MeetupRequest,
  MeetupRequestCreate,
  PhoneVerificationStart,
  Stake,
  User,
  VerificationStatus,
  WalletAccountInfo,
} from "./types";

const BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...rest } = init;

  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string> | undefined),
  };

  if (auth) {
    const token = getToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...rest, headers: finalHeaders });

  if (res.status === 401 && auth) {
    // Token expired or revoked — drop it so the UI falls back to sign-in
    // instead of retrying with a credential that will never work.
    clearSession();
  }

  if (!res.ok) {
    throw new ApiError(res.status, await extractError(res));
  }

  // 204 and other empty bodies would throw on .json().
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function extractError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
    // FastAPI validation errors arrive as a list of objects.
    if (Array.isArray(body?.detail)) {
      return body.detail.map((d: { msg?: string }) => d.msg ?? "Invalid input").join("; ");
    }
    return res.statusText || `Request failed (${res.status})`;
  } catch {
    return res.statusText || `Request failed (${res.status})`;
  }
}

// ---------------------------------------------------------------------------
// Managed wallet auth
// ---------------------------------------------------------------------------

export const auth = {
  requestCode(target: { email?: string; phone?: string }) {
    return request<LoginCodeResponse>("/wallet/login/code", {
      method: "POST",
      body: JSON.stringify(target),
      auth: false,
    });
  },

  verifyCode(payload: { code: string; email?: string; phone?: string }) {
    return request<AuthToken>("/wallet/login/verify", {
      method: "POST",
      body: JSON.stringify(payload),
      auth: false,
    });
  },

  walletChallenge(walletAddress: string) {
    return request<{ nonce: string; expires_at: string }>(
      `/users/challenge?wallet_address=${encodeURIComponent(walletAddress)}`,
      { method: "POST", auth: false },
    );
  },

  walletOnboard(payload: {
    wallet_address: string;
    signature: string;
    nonce: string;
  }) {
    return request<AuthToken>("/users/onboard", {
      method: "POST",
      body: JSON.stringify(payload),
      auth: false,
    });
  },

  accountInfo() {
    return request<WalletAccountInfo>("/wallet/me");
  },
};

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const users = {
  me() {
    return request<User>("/users/me");
  },

  update(payload: {
    gender?: string;
    birth_year?: number;
    email?: string;
    privacy_mode?: string;
  }) {
    return request<User>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
};

// ---------------------------------------------------------------------------
// Meetups (R1 / R10 / R11)
// ---------------------------------------------------------------------------

export const meetups = {
  create(payload: MeetupRequestCreate) {
    return request<MeetupRequest>("/meetups/requests", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  listMine() {
    return request<MeetupRequest[]>("/meetups/requests");
  },

  get(id: string) {
    return request<MeetupRequest>(`/meetups/requests/${id}`);
  },

  cancel(id: string) {
    return request<MeetupRequest>(`/meetups/requests/${id}/cancel`, {
      method: "POST",
    });
  },

  /** Returns an empty array when nothing qualifies — never padded. */
  candidates(id: string, limit = 10) {
    return request<MeetupCandidate[]>(
      `/meetups/requests/${id}/candidates?limit=${limit}`,
    );
  },

  propose(requestId: string, counterpartRequestId: string) {
    return request<MeetupMatch>(
      `/meetups/requests/${requestId}/propose/${counterpartRequestId}`,
      { method: "POST" },
    );
  },

  matches(requestId: string) {
    return request<MeetupMatch[]>(`/meetups/requests/${requestId}/matches`);
  },

  match(matchId: string) {
    return request<MeetupMatchDetail>(`/meetups/matches/${matchId}`);
  },

  respond(matchId: string, accept: boolean) {
    return request<MeetupMatch>(`/meetups/matches/${matchId}/respond`, {
      method: "POST",
      body: JSON.stringify({ accept }),
    });
  },

  /** R3: icebreakers, itinerary and a mini-game. Generated on first access. */
  plan(matchId: string) {
    return request<MeetupPlan>(`/meetups/matches/${matchId}/plan`);
  },

  regeneratePlan(matchId: string) {
    return request<MeetupPlan>(`/meetups/matches/${matchId}/plan/regenerate`, {
      method: "POST",
    });
  },

  adoptPlan(matchId: string) {
    return request<MeetupPlan>(`/meetups/matches/${matchId}/plan/adopt`, {
      method: "POST",
    });
  },
};

// ---------------------------------------------------------------------------
// Commitment deposit
// ---------------------------------------------------------------------------

export const stakes = {
  requirements(amountMon: number) {
    return request<DepositRequirements>(
      `/stakes/deposit-requirements?amount_mon=${amountMon}`,
    );
  },

  create(payload: {
    stake_type: string;
    amount_mon: number;
    tx_hash?: string;
    meetup_match_id?: string;
    target_user_id?: string;
  }) {
    return request<Stake>("/stakes", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  listMine() {
    return request<Stake[]>("/stakes/me");
  },
};

// ---------------------------------------------------------------------------
// Verification (R4)
// ---------------------------------------------------------------------------

export const verification = {
  status() {
    return request<VerificationStatus>("/verification/me");
  },

  startPhone(phone: string) {
    return request<PhoneVerificationStart>("/verification/phone/start", {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
  },

  confirmPhone(phone: string, code: string) {
    return request<User>("/verification/phone/confirm", {
      method: "POST",
      body: JSON.stringify({ phone, code }),
    });
  },

  submitId(documentNumber: string, birthYear?: number) {
    return request<IdVerificationResult>("/verification/id/submit", {
      method: "POST",
      body: JSON.stringify({
        document_number: documentNumber,
        birth_year: birthYear,
      }),
    });
  },
};

// ---------------------------------------------------------------------------
// Attestations
// ---------------------------------------------------------------------------

export const attestations = {
  initiate(payload: {
    match_id: string;
    method: string;
    meetup_match_id?: string;
    latitude?: number;
    longitude?: number;
  }) {
    return request<Attestation>("/attestations/meetup/initiate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  confirm(
    id: string,
    payload: { token?: string; latitude?: number; longitude?: number },
  ) {
    return request<Attestation>(`/attestations/meetup/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  listMine() {
    return request<Attestation[]>("/attestations/me");
  },
};

// ---------------------------------------------------------------------------
// Credentials + credit (R8 / R9)
// ---------------------------------------------------------------------------

export const credentials = {
  listMine(limit = 20, offset = 0) {
    return request<CredentialList>(
      `/credentials/me?limit=${limit}&offset=${offset}`,
    );
  },

  credit() {
    return request<Credit>("/credentials/me/credit");
  },
};

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

export const safety = {
  report(payload: {
    reported_user_id: string;
    report_type: string;
    description: string;
  }) {
    return request<{ id: string; status: string }>("/safety/report", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  block(blockedUserId: string) {
    return request<{ blocker_id: string }>("/safety/block", {
      method: "POST",
      body: JSON.stringify({ blocked_user_id: blockedUserId }),
    });
  },
};

export const api = {
  auth,
  users,
  verification,
  meetups,
  stakes,
  attestations,
  credentials,
  safety,
};
