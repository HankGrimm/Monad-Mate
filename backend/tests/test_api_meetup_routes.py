"""
HTTP-layer tests for the new R1 / R8 / R9 / R10 / managed-wallet routes.
Uses the `client` fixture from conftest.py (FastAPI TestClient + SQLite).
"""
import uuid

from app.core.auth import create_access_token
from app.core.config import settings
from app.models.user import Gender, User, VerificationLevel


def _user(db, gender: Gender = Gender.FEMALE, level=VerificationLevel.ID) -> User:
    user = User(
        id=uuid.uuid4(),
        wallet_address=f"0x{uuid.uuid4().hex[:38]}",
        gender=gender,
        verification_level=level,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.wallet_address)}"}


def _request_body(**overrides) -> dict:
    body = {
        "venue_type": "mall",
        "venue_name": "Taikoo Li Mall",
        "venue_key": "mall-taikoo-li",
        "scene": "dining",
        "duration_minutes": 60,
    }
    body.update(overrides)
    return body


# ── Meetup requests (R1) ──────────────────────────────────────────────────────

class TestMeetupRequestAPI:
    def test_create_requires_auth(self, client):
        resp = client.post("/v1/meetups/requests", json=_request_body())
        assert resp.status_code in (401, 403)

    def test_create_returns_window(self, client, db):
        user = _user(db)
        resp = client.post(
            "/v1/meetups/requests", json=_request_body(), headers=_auth(user)
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "open"
        assert data["venue_key"] == "mall-taikoo-li"
        assert data["window_end"] > data["window_start"]

    def test_unverified_user_blocked(self, client, db):
        user = _user(db, level=VerificationLevel.WALLET)
        resp = client.post(
            "/v1/meetups/requests", json=_request_body(), headers=_auth(user)
        )
        assert resp.status_code == 403

    def test_candidates_empty_when_alone(self, client, db):
        user = _user(db)
        created = client.post(
            "/v1/meetups/requests", json=_request_body(), headers=_auth(user)
        ).json()

        resp = client.get(
            f"/v1/meetups/requests/{created['id']}/candidates", headers=_auth(user)
        )
        assert resp.status_code == 200
        # No padding with weak matches — an empty venue returns nothing.
        assert resp.json() == []

    def test_candidate_and_mutual_confirm_flow(self, client, db):
        a, b = _user(db), _user(db)
        req_a = client.post(
            "/v1/meetups/requests", json=_request_body(), headers=_auth(a)
        ).json()
        req_b = client.post(
            "/v1/meetups/requests", json=_request_body(), headers=_auth(b)
        ).json()

        candidates = client.get(
            f"/v1/meetups/requests/{req_a['id']}/candidates", headers=_auth(a)
        ).json()
        assert len(candidates) == 1
        assert candidates[0]["counterpart_request_id"] == req_b["id"]
        assert candidates[0]["reasons"]

        proposed = client.post(
            f"/v1/meetups/requests/{req_a['id']}/propose/{req_b['id']}",
            headers=_auth(a),
        )
        assert proposed.status_code == 201
        match = proposed.json()
        assert match["status"] == "accepted"

        confirmed = client.post(
            f"/v1/meetups/matches/{match['id']}/respond",
            json={"accept": True},
            headers=_auth(b),
        )
        assert confirmed.status_code == 200
        assert confirmed.json()["status"] == "confirmed"

    def test_pass_declines_without_penalty(self, client, db):
        a, b = _user(db), _user(db)
        req_a = client.post(
            "/v1/meetups/requests", json=_request_body(), headers=_auth(a)
        ).json()
        req_b = client.post(
            "/v1/meetups/requests", json=_request_body(), headers=_auth(b)
        ).json()
        match = client.post(
            f"/v1/meetups/requests/{req_a['id']}/propose/{req_b['id']}",
            headers=_auth(a),
        ).json()

        resp = client.post(
            f"/v1/meetups/matches/{match['id']}/respond",
            json={"accept": False},
            headers=_auth(b),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "declined"

        # Both requests are open again
        mine = client.get("/v1/meetups/requests", headers=_auth(a)).json()
        assert mine[0]["status"] == "open"

    def test_cancel_request(self, client, db):
        user = _user(db)
        created = client.post(
            "/v1/meetups/requests", json=_request_body(), headers=_auth(user)
        ).json()

        resp = client.post(
            f"/v1/meetups/requests/{created['id']}/cancel", headers=_auth(user)
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "cancelled"


# ── R10 safety preferences ────────────────────────────────────────────────────

class TestSafetyPreferenceAPI:
    def test_same_gender_only_filters_hard(self, client, db):
        a = _user(db, gender=Gender.FEMALE)
        b = _user(db, gender=Gender.MALE)
        req_a = client.post(
            "/v1/meetups/requests",
            json=_request_body(gender_preference="same_only"),
            headers=_auth(a),
        ).json()
        client.post("/v1/meetups/requests", json=_request_body(), headers=_auth(b))

        candidates = client.get(
            f"/v1/meetups/requests/{req_a['id']}/candidates", headers=_auth(a)
        ).json()
        assert candidates == []

    def test_same_gender_only_needs_declared_gender(self, client, db):
        user = _user(db, gender=Gender.UNDISCLOSED)
        resp = client.post(
            "/v1/meetups/requests",
            json=_request_body(gender_preference="same_only"),
            headers=_auth(user),
        )
        assert resp.status_code == 400

    def test_user_can_set_gender(self, client, db):
        user = _user(db, gender=Gender.UNDISCLOSED)
        resp = client.patch(
            "/v1/users/me", json={"gender": "female"}, headers=_auth(user)
        )
        assert resp.status_code == 200
        assert resp.json()["gender"] == "female"


# ── R8 / R9 credentials ───────────────────────────────────────────────────────

class TestCredentialAPI:
    def test_list_credentials_empty(self, client, db):
        user = _user(db)
        resp = client.get("/v1/credentials/me", headers=_auth(user))
        assert resp.status_code == 200
        assert resp.json() == {"items": [], "total": 0}

    def test_credit_locked_without_history(self, client, db):
        user = _user(db)
        resp = client.get("/v1/credentials/me/credit", headers=_auth(user))
        assert resp.status_code == 200
        data = resp.json()
        assert data["score_available"] is False
        assert data["credit_score"] is None
        assert "not a personal-safety guarantee" in data["disclaimer"]

    def test_credentials_require_auth(self, client):
        assert client.get("/v1/credentials/me").status_code in (401, 403)
        assert client.get("/v1/credentials/me/credit").status_code in (401, 403)


# ── Managed wallet ────────────────────────────────────────────────────────────

class TestManagedWalletAPI:
    def test_email_login_round_trip(self, client, db, monkeypatch):
        monkeypatch.setattr(settings, "ENVIRONMENT", "development")

        issued = client.post(
            "/v1/wallet/login/code", json={"email": "api@example.com"}
        )
        assert issued.status_code == 200
        code = issued.json()["code"]
        assert code

        verified = client.post(
            "/v1/wallet/login/verify",
            json={"code": code, "email": "api@example.com"},
        )
        assert verified.status_code == 200
        body = verified.json()
        assert body["user"]["wallet_kind"] == "managed"
        assert body["access_token"]

    def test_production_withholds_code(self, client, monkeypatch):
        monkeypatch.setattr(settings, "ENVIRONMENT", "production")
        resp = client.post(
            "/v1/wallet/login/code", json={"email": "prod@example.com"}
        )
        assert resp.status_code == 200
        assert resp.json()["code"] is None

    def test_bad_code_rejected(self, client, monkeypatch):
        monkeypatch.setattr(settings, "ENVIRONMENT", "development")
        client.post("/v1/wallet/login/code", json={"email": "bad@example.com"})
        resp = client.post(
            "/v1/wallet/login/verify",
            json={"code": "000000", "email": "bad@example.com"},
        )
        assert resp.status_code == 401

    def test_account_info_reports_custody(self, client, db, monkeypatch):
        monkeypatch.setattr(settings, "ENVIRONMENT", "development")
        code = client.post(
            "/v1/wallet/login/code", json={"email": "info@example.com"}
        ).json()["code"]
        token = client.post(
            "/v1/wallet/login/verify",
            json={"code": code, "email": "info@example.com"},
        ).json()["access_token"]

        resp = client.get(
            "/v1/wallet/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["managed"] is True
        assert data["gas_sponsored"] is True
        assert "custodial" in data["custody_disclosure"].lower()

    def test_account_info_requires_auth(self, client):
        assert client.get("/v1/wallet/me").status_code in (401, 403)
