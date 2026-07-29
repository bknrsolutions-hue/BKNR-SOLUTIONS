import importlib


def test_database_source_does_not_print_database_url():
    from pathlib import Path

    source = (Path(__file__).parents[2] / "app" / "database.py").read_text()
    assert 'print("DATABASE_URL:"' not in source


def test_batch_number_normalization():
    from app.database import normalize_batch_number

    assert normalize_batch_number("  lot-001 ") == "LOT-001"
    assert normalize_batch_number("LOT-001") == "LOT-001"
    assert normalize_batch_number(None) is None


def test_production_cache_does_not_fall_back_to_process_memory(monkeypatch):
    import app.services.cache as cache

    monkeypatch.setattr(cache, "IS_PRODUCTION", True)
    monkeypatch.setattr(cache, "REDIS_URL", None)
    monkeypatch.setattr(cache, "_redis_client", None)
    cache._memory_cache.clear()

    cache.cache_set("bknr:test:company:value", {"stale": True})

    assert cache.cache_get("bknr:test:company:value") is None
    assert cache._memory_cache == {}
