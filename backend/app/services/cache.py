import os
import pickle
import time
from fnmatch import fnmatch
from typing import Any, Callable

try:
    import redis
except Exception:  # pragma: no cover - optional production dependency
    redis = None


DEFAULT_TTL_SECONDS = int(os.environ.get("CACHE_TTL_SECONDS", "60"))
REDIS_URL = os.environ.get("REDIS_URL")

_memory_cache: dict[str, tuple[float, bytes]] = {}
_redis_client = None


def _client():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    if not REDIS_URL or redis is None:
        return None
    try:
        _redis_client = redis.from_url(REDIS_URL, socket_timeout=1, socket_connect_timeout=1)
        _redis_client.ping()
        return _redis_client
    except Exception:
        _redis_client = None
        return None


def cache_get(key: str) -> Any | None:
    client = _client()
    if client:
        try:
            raw = client.get(key)
            return pickle.loads(raw) if raw else None
        except Exception:
            return None

    item = _memory_cache.get(key)
    if not item:
        return None
    expires_at, raw = item
    if expires_at < time.time():
        _memory_cache.pop(key, None)
        return None
    return pickle.loads(raw)


def cache_set(key: str, value: Any, ttl: int = DEFAULT_TTL_SECONDS) -> None:
    raw = pickle.dumps(value, protocol=pickle.HIGHEST_PROTOCOL)
    client = _client()
    if client:
        try:
            client.setex(key, ttl, raw)
            return
        except Exception:
            pass
    _memory_cache[key] = (time.time() + ttl, raw)


def cache_get_or_set(key: str, builder: Callable[[], Any], ttl: int = DEFAULT_TTL_SECONDS) -> Any:
    cached = cache_get(key)
    if cached is not None:
        return cached
    value = builder()
    cache_set(key, value, ttl)
    return value


def cache_delete_pattern(pattern: str) -> None:
    client = _client()
    if client:
        try:
            for key in client.scan_iter(pattern):
                client.delete(key)
            return
        except Exception:
            pass

    for key in list(_memory_cache.keys()):
        if fnmatch(key, pattern):
            _memory_cache.pop(key, None)


def invalidate_company_cache(company_id: str, area: str = "*") -> None:
    if company_id:
        cache_delete_pattern(f"bknr:{area}:{company_id}:*")


def invalidate_live_company_caches(company_id: str) -> None:
    for area in (
        "inventory_dashboard",
        "inventory_report",
        "costing_dashboard",
        "export_documents",
        "finance_dashboard",
        "processing_summary",
        "processing_forms",
        "processing_reports",
        "menu",
    ):
        invalidate_company_cache(company_id, area)
