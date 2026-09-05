"""
LLM & Embedding Service — Monad Mate

AI inference routes to local model services (no cloud keys needed):
  - Ollama /api/chat (deepseek-r1:32b) for intro / meetup-plan generation
  - Xinference /v1/embeddings (bge-large-zh-v1.5, 1024-dim) for semantic vectors

ZeroDB vector search (optional cloud) still goes through AINative when
AINATIVE_API_KEY is set; falls back gracefully otherwise.

Ollama:  host=127.0.0.1:11434, container=http://host.docker.internal:11434
Embed:   host=127.0.0.1:9997,  container=http://host.docker.internal:9997
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_BASE = os.getenv("AINATIVE_API_URL", "https://api.ainative.studio")
# 172.20.0.1 = Hackathon_network 网关（宿主机服务）；本机 compose environment
# 新增键注入不可靠，此处默认值即容器内实际值。裸跑时 env 覆盖为 127.0.0.1。
_OLLAMA_BASE = os.getenv("OLLAMA_BASE_URL", "http://172.20.0.1:11434")
_OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "deepseek-r1:32b")
_EMBED_BASE = os.getenv("EMBEDDINGS_BASE_URL", "http://172.20.0.1:9997")
_EMBED_MODEL = os.getenv("EMBEDDINGS_MODEL", "bge-large-zh-v1.5")
_EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "1024"))  # bge-large-zh-v1.5


def _api_key() -> Optional[str]:
    return os.getenv("AINATIVE_API_KEY")


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_api_key()}",
        "X-API-Key": _api_key() or "",
        "Content-Type": "application/json",
    }


def _is_configured() -> bool:
    return bool(_api_key())


def _ollama_chat(
    messages: list[dict],
    *,
    temperature: float = 0.6,
    timeout: float = 180.0,
) -> Optional[str]:
    """Call the local Ollama chat API (non-streaming, native /api/chat format).

    deepseek-r1 returns a `thinking` field alongside `content`; only the final
    `content` is used. Returns None on any failure so callers can fall back.
    """
    try:
        resp = httpx.post(
            f"{_OLLAMA_BASE}/api/chat",
            json={
                "model": _OLLAMA_MODEL,
                "messages": messages,
                "stream": False,
                "options": {"temperature": temperature, "num_ctx": 30000},
            },
            timeout=timeout,
        )
        if resp.status_code == 200:
            content = ((resp.json().get("message") or {}).get("content") or "").strip()
            if content:
                return content
            logger.warning("Ollama returned empty content")
        else:
            logger.warning("Ollama HTTP %s: %s", resp.status_code, resp.text[:80])
    except Exception as exc:
        logger.warning("Ollama error: %s", exc)
    return None


# ---------------------------------------------------------------------------
# LLM: intro generation
# ---------------------------------------------------------------------------

def generate_match_intro(
    *,
    requester_name: str,
    target_name: str,
    shared_interests: list[str],
    requester_intent: Optional[str] = None,
    context: Optional[str] = None,
) -> str:
    """
    Generate a personalised opening message via the local Ollama LLM
    (deepseek-r1:32b). Falls back to a deterministic template on failure.
    """
    interest_str = ", ".join(shared_interests[:5]) if shared_interests else "similar vibes"
    intent_hint = f" (intent: {requester_intent})" if requester_intent else ""
    context_hint = f"\nExtra context from requester: {context}" if context else ""

    system = (
        "You are a warm, witty social connector. Write a short, genuine opening message "
        "from one person to another. Keep it under 60 words. Natural, no emojis, no cringe."
    )
    user_prompt = (
        f"{requester_name} wants to connect with {target_name}{intent_hint}.\n"
        f"They share interests in: {interest_str}.{context_hint}\n"
        f"Write an opening DM from {requester_name} to {target_name}."
    )

    content = _ollama_chat(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.6,
        timeout=180,
    )
    if content:
        logger.info("Local LLM generated intro (%d chars)", len(content))
        return content

    return _fallback_intro(requester_name, target_name, shared_interests, context)


def _fallback_intro(
    requester_name: str,
    target_name: str,
    shared_interests: list[str],
    context: Optional[str],
) -> str:
    parts = [f"Hi {target_name}!"]
    if shared_interests:
        parts.append(f"We both love {', '.join(shared_interests[:3])}.")
    if context:
        parts.append(context)
    parts.append("Looks like we might vibe well together.")
    return " ".join(parts)


# ---------------------------------------------------------------------------
# LLM: meetup plan generation (R3)
# ---------------------------------------------------------------------------

def generate_plan_completion(*, system: str, user_prompt: str) -> Optional[str]:
    """Raw chat completion used by the meetup plan generator.

    Returns the model's text, or None on any failure so the caller can fall back
    to a deterministic template. deepseek-r1 推理较慢，超时给足 300s。
    """
    content = _ollama_chat(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.6,
        timeout=300,
    )
    if content:
        logger.info("Local LLM generated meetup plan (%d chars)", len(content))
        return content
    return None


# ---------------------------------------------------------------------------
# Embeddings: 1024-dim vectors via local Xinference (bge-large-zh-v1.5)
# ---------------------------------------------------------------------------

def embed_text(text: str) -> list[float]:
    """
    Generate a 1024-dim bge-large-zh-v1.5 embedding via the local Xinference
    service (OpenAI-compatible /v1/embeddings).
    Returns a zero vector on failure (safe for cosine similarity — treated as no-match).
    """
    try:
        resp = httpx.post(
            f"{_EMBED_BASE}/v1/embeddings",
            json={"model": _EMBED_MODEL, "input": [text]},
            timeout=15,
        )
        if resp.status_code == 200:
            data = resp.json().get("data", [])
            if data:
                vec = data[0].get("embedding") or []
                if vec:
                    logger.debug("local embed: %d-dim vector", len(vec))
                    return vec
        logger.warning("embed HTTP %s: %s", resp.status_code, resp.text[:80])
    except Exception as exc:
        logger.warning("embed error: %s", exc)

    return [0.0] * _EMBEDDING_DIM


def embed_preferences(interests: list[str], personality_traits: list[str]) -> list[float]:
    """
    Embed a user's preference profile as a single semantic vector.
    Joins interests + personality traits into a natural-language string.
    """
    if not interests and not personality_traits:
        return [0.0] * _EMBEDDING_DIM

    text = "Interests: " + ", ".join(interests or [])
    if personality_traits:
        text += ". Personality: " + ", ".join(personality_traits)

    return embed_text(text)


# ---------------------------------------------------------------------------
# Vector search: semantic similarity via ZeroDB
# ---------------------------------------------------------------------------

def search_similar_profiles(
    embedding: list[float],
    namespace: str = "monad-mate-preferences",
    limit: int = 20,
    min_score: float = 0.5,
) -> list[dict]:
    """
    Semantic search over stored preference embeddings using ZeroDB vector store.
    Returns list of {id, text, score, metadata} dicts.
    """
    if not _is_configured():
        return []

    # Skip search if embedding is a zero vector (unconfigured fallback)
    if all(v == 0.0 for v in embedding[:10]):
        return []

    try:
        resp = httpx.post(
            f"{_BASE}/zerodb/vectors/search",
            json={
                "query": embedding,
                "limit": limit,
                "min_score": min_score,
                "namespace": namespace,
            },
            headers=_headers(),
            timeout=10,
        )
        if resp.status_code == 200:
            results = resp.json().get("results", [])
            logger.debug("ZeroDB vector search: %d results", len(results))
            return results
        logger.warning("ZeroDB search HTTP %s: %s", resp.status_code, resp.text[:80])
    except Exception as exc:
        logger.warning("ZeroDB search error: %s", exc)

    return []


def upsert_preference_vector(
    user_id: str,
    embedding: list[float],
    metadata: dict,
    namespace: str = "monad-mate-preferences",
) -> Optional[str]:
    """
    Store or update a preference embedding in ZeroDB vector store.
    Returns the vector ID on success, None on failure.
    """
    if not _is_configured():
        return None

    if all(v == 0.0 for v in embedding[:10]):
        return None

    try:
        resp = httpx.post(
            f"{_BASE}/zerodb/vectors/upsert",
            json={
                "texts": [metadata.get("profile_text", str(user_id))],
                "ids": [f"monadmate-pref-{user_id}"],
                "metadata": [{"user_id": user_id, **metadata}],
                "namespace": namespace,
            },
            headers=_headers(),
            timeout=10,
        )
        if resp.status_code in (200, 201):
            vector_id = resp.json().get("ids", [None])[0]
            logger.debug("ZeroDB upserted preference for user %s → %s", user_id, vector_id)
            return vector_id
        logger.warning("ZeroDB upsert HTTP %s: %s", resp.status_code, resp.text[:80])
    except Exception as exc:
        logger.warning("ZeroDB upsert error: %s", exc)

    return None


# ---------------------------------------------------------------------------
# Content moderation: AI safety check
# ---------------------------------------------------------------------------

def moderate_message(text: str) -> dict:
    """
    Quick safety check on a message before delivery.
    Returns {"safe": bool, "reason": str, "score": float}.
    Falls back to safe=True if unconfigured.
    """
    if not _is_configured() or not text:
        return {"safe": True, "reason": "unchecked", "score": 1.0}

    try:
        resp = httpx.post(
            f"{_BASE}/api/v1/chat/completions",
            json={
                "model": "llama-3.1-8b",
                "max_tokens": 20,
                "temperature": 0.0,
                "messages": [{
                    "role": "user",
                    "content": (
                        f'Rate this message safety for a social app (respond with only JSON '
                        f'{{"safe":true/false,"score":0.0-1.0,"reason":"one word"}}):\n"{text}"'
                    )
                }],
            },
            headers=_headers(),
            timeout=8,
        )
        if resp.status_code == 200:
            raw = resp.json()["choices"][0]["message"]["content"].strip()
            import json
            # Extract JSON from response
            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start >= 0 and end > start:
                result = json.loads(raw[start:end])
                return {
                    "safe": bool(result.get("safe", True)),
                    "reason": result.get("reason", "ok"),
                    "score": float(result.get("score", 1.0)),
                }
    except Exception as exc:
        logger.warning("AINative moderation error: %s", exc)

    return {"safe": True, "reason": "unchecked", "score": 1.0}
