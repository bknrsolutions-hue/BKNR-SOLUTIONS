"""Central application configuration with production fail-fast guards."""

from __future__ import annotations

import os
import sys

from dotenv import load_dotenv

load_dotenv()

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").strip().lower()
IS_PRODUCTION = ENVIRONMENT == "production"
IS_TEST = ENVIRONMENT == "test"


def _env(name: str, dev_default: str = "") -> str:
    explicit = os.getenv(name, "").strip()
    if IS_PRODUCTION:
        if not explicit:
            print(f"FATAL: Environment variable {name} must be explicitly set when ENVIRONMENT=production", file=sys.stderr)
            sys.exit(1)
        return explicit
    return explicit or dev_default


DATABASE_URL = _env(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:143211Nr@localhost:5432/bknr_erp",
)

SESSION_SECRET_KEY = _env(
    "SESSION_SECRET_KEY",
    "dev-only-session-secret-not-for-production",
)
DEPLOYMENT_TOKEN = _env(
    "DEPLOYMENT_TOKEN",
    "dev-only-deploy-token-not-for-production",
)

_raw_super_admins = os.getenv("SUPER_ADMIN_EMAILS", "").strip()
if IS_PRODUCTION and not _raw_super_admins:
    print("FATAL: Environment variable SUPER_ADMIN_EMAILS must be set when ENVIRONMENT=production", file=sys.stderr)
    sys.exit(1)

if not _raw_super_admins and not IS_PRODUCTION:
    _raw_super_admins = "bknr.solutions@gmail.com"

SUPER_ADMIN_EMAILS = frozenset(
    email.strip().lower()
    for email in _raw_super_admins.split(",")
    if email.strip()
)

_raw_cors_origins = os.getenv("CORS_ORIGINS", "").strip()
if IS_PRODUCTION and not _raw_cors_origins:
    print("FATAL: Environment variable CORS_ORIGINS must be set when ENVIRONMENT=production", file=sys.stderr)
    sys.exit(1)

if not _raw_cors_origins:
    _raw_cors_origins = "http://localhost:5173,http://localhost:8081,http://127.0.0.1:5173"

CORS_ORIGINS = [
    origin.strip()
    for origin in _raw_cors_origins.split(",")
    if origin.strip()
]

RUN_LEGACY_STARTUP_MIGRATION = os.getenv("RUN_LEGACY_STARTUP_MIGRATION", "").strip().lower() in {
    "1",
    "true",
    "yes",
}

