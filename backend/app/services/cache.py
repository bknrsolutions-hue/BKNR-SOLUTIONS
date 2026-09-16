import json
import os
import time
from datetime import date, datetime
from decimal import Decimal
from fnmatch import fnmatch
from typing import Any, Callable
from uuid import UUID

from app.config import IS_PRODUCTION

try:
    import redis
except Exception:  # pragma: no cover - optional production dependency
    redis = None


DEFAULT_TTL_SECONDS = int(os.environ.get("CACHE_TTL_SECONDS", "60"))
REDIS_URL = os.environ.get("REDIS_URL")

_memory_cache: dict[str, tuple[float, bytes]] = {}
_redis_client = None


class CacheEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, (datetime, date)):
            return {"__cache_type__": "datetime", "value": o.isoformat()}
        if isinstance(o, Decimal):
            return {"__cache_type__": "decimal", "value": str(o)}
        if isinstance(o, UUID):
            return {"__cache_type__": "uuid", "value": str(o)}
        if isinstance(o, set):
            return {"__cache_type__": "set", "value": list(o)}
        return super().default(o)


def _object_hook(item):
    if isinstance(item, dict) and item.get("__cache_type__") == "datetime":
        raw = item["value"]
        try:
            return datetime.fromisoformat(raw)
        except ValueError:
            return date.fromisoformat(raw)
    if isinstance(item, dict) and item.get("__cache_type__") == "decimal":
        return Decimal(item["value"])
    if isinstance(item, dict) and item.get("__cache_type__") == "uuid":
        return UUID(item["value"])
    if isinstance(item, dict) and item.get("__cache_type__") == "set":
        return set(item["value"])
    return item


def _serialize(value: Any) -> bytes:
    return json.dumps(value, cls=CacheEncoder, separators=(",", ":")).encode("utf-8")


def _deserialize(raw: bytes) -> Any:
    return json.loads(raw.decode("utf-8"), object_hook=_object_hook)


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
            return _deserialize(raw) if raw else None
        except Exception:
            return None

    if IS_PRODUCTION:
        return None

    item = _memory_cache.get(key)
    if not item:
        return None
    expires_at, raw = item
    if expires_at < time.time():
        _memory_cache.pop(key, None)
        return None
    return _deserialize(raw)


def cache_set(key: str, value: Any, ttl: int = DEFAULT_TTL_SECONDS) -> None:
    raw = _serialize(value)
    client = _client()
    if client:
        try:
            client.setex(key, ttl, raw)
            return
        except Exception:
            pass
    if IS_PRODUCTION:
        return
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

    if IS_PRODUCTION:
        return

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
