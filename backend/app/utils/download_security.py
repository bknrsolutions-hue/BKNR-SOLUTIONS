import base64
import fcntl
import hashlib
import hmac
import json
import os
import secrets
import tempfile
import time
from pathlib import Path

from fastapi import HTTPException, Request


DOWNLOAD_GRANT_TTL_SECONDS = 300
DOWNLOAD_TOKEN_SECRET = os.getenv("SESSION_SECRET_KEY", "bknr_secret_key_2026_dev_only").encode()
CONSUMED_GRANTS_FILE = Path(tempfile.gettempdir()) / "svbk_download_grants_consumed.json"


def _session_key(request: Request) -> str:
    company_code = request.session.get("company_code")
    if not company_code:
        raise HTTPException(status_code=401, detail="Session expired or unauthorized")
    return str(request.session.get("session_id") or company_code)


def _encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + ("=" * (-len(value) % 4)))


def issue_download_grant(request: Request) -> str:
    payload = {
        "nonce": secrets.token_urlsafe(18),
        "session_key": _session_key(request),
        "company_code": str(request.session.get("company_code")),
        "expires_at": int(time.time()) + DOWNLOAD_GRANT_TTL_SECONDS,
    }
    encoded = _encode(json.dumps(payload, separators=(",", ":")).encode())
    signature = _encode(hmac.new(DOWNLOAD_TOKEN_SECRET, encoded.encode(), hashlib.sha256).digest())
    return f"{encoded}.{signature}"


def _consume_once(nonce: str, expires_at: int) -> bool:
    CONSUMED_GRANTS_FILE.touch(exist_ok=True)
    with CONSUMED_GRANTS_FILE.open("r+") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            try:
                consumed = json.load(handle)
            except (json.JSONDecodeError, OSError):
                consumed = {}
            now = int(time.time())
            consumed = {key: expiry for key, expiry in consumed.items() if int(expiry) >= now}
            if nonce in consumed:
                return False
            consumed[nonce] = expires_at
            handle.seek(0)
            handle.truncate()
            json.dump(consumed, handle)
            handle.flush()
            os.fsync(handle.fileno())
            return True
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def require_download_grant(request: Request) -> None:
    token = request.headers.get("X-SVBK-Download-Token") or request.query_params.get("download_token") or ""
    try:
        encoded, supplied_signature = token.split(".", 1)
        expected_signature = _encode(hmac.new(DOWNLOAD_TOKEN_SECRET, encoded.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(expected_signature, supplied_signature):
            raise ValueError("signature mismatch")
        payload = json.loads(_decode(encoded))
        expires_at = int(payload["expires_at"])
        valid = (
            expires_at >= int(time.time())
            and str(payload["session_key"]) == _session_key(request)
            and str(payload["company_code"]) == str(request.session.get("company_code"))
            and _consume_once(str(payload["nonce"]), expires_at)
        )
        if not valid:
            raise ValueError("expired, mismatched or consumed token")
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        raise HTTPException(
            status_code=403,
            detail="Admin OTP verification is required before every download",
        )
