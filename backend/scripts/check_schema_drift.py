"""Read-only SQLAlchemy model ↔ database schema drift check.

Usage:
    python scripts/check_schema_drift.py

The command never changes the database and never prints DATABASE_URL.  It exits
with status 1 when model tables, columns, or indexes are missing.
"""

from __future__ import annotations

import contextlib
import importlib
import io
import json
import os
import pkgutil
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import make_url


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def load_metadata():
    # app.database historically emitted connection diagnostics during import.
    # Suppress import-time stdout so a database URL can never enter CI logs.
    with contextlib.redirect_stdout(io.StringIO()):
        database_module = importlib.import_module("app.database")
        models_package = importlib.import_module("app.database.models")
        for module in pkgutil.iter_modules(models_package.__path__):
            importlib.import_module(
                f"app.database.models.{module.name}"
            )
    return database_module.Base.metadata


def main() -> int:
    load_dotenv()
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        print("DATABASE_URL is not configured", file=sys.stderr)
        return 2

    parsed_url = make_url(database_url)
    host = (parsed_url.host or "").lower()
    target = {
        "environment": os.getenv("ENVIRONMENT", "development"),
        "database_name": parsed_url.database,
        "host_kind": (
            "local"
            if host in {"", "localhost", "127.0.0.1", "::1"}
            else "remote"
        ),
    }

    metadata = load_metadata()
    engine = create_engine(database_url, pool_pre_ping=True)
    try:
        inspector = inspect(engine)
        database_tables = set(inspector.get_table_names())
        model_tables = metadata.tables

        missing_tables = sorted(set(model_tables) - database_tables)
        missing_columns: dict[str, list[str]] = {}
        missing_indexes: dict[str, list[str]] = {}

        for table_name, table in sorted(model_tables.items()):
            if table_name not in database_tables:
                continue

            database_columns = {
                column["name"]
                for column in inspector.get_columns(table_name)
            }
            columns = sorted(
                column.name
                for column in table.columns
                if column.name not in database_columns
            )
            if columns:
                missing_columns[table_name] = columns

            database_indexes = {
                index["name"]
                for index in inspector.get_indexes(table_name)
                if index.get("name")
            }
            indexes = sorted(
                index.name
                for index in table.indexes
                if index.name and index.name not in database_indexes
            )
            if indexes:
                missing_indexes[table_name] = indexes

        report = {
            "target": target,
            "model_table_count": len(model_tables),
            "database_table_count": len(database_tables),
            "missing_tables": missing_tables,
            "missing_columns": missing_columns,
            "missing_indexes": missing_indexes,
        }
        print(json.dumps(report, indent=2))
        return 1 if any(
            (missing_tables, missing_columns, missing_indexes)
        ) else 0
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
