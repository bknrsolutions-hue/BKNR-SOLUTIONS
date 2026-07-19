"""Shared SVBK ERP test fixtures.

Database-backed tests are deliberately disabled unless SVBK_TEST_DATABASE_URL
points to an unmistakable test database. This prevents an accidental cleanup
against production or a developer's normal ERP database.
"""

from __future__ import annotations

import os
from urllib.parse import urlparse

import pytest


os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("SVBK_SKIP_STARTUP_TASKS", "1")
os.environ.setdefault("SESSION_SECRET_KEY", "svbk-test-session-secret-not-for-production")
os.environ.setdefault("DEVELOPMENT_SECRET_LOGGING", "false")

TEST_DATABASE_URL = os.getenv("SVBK_TEST_DATABASE_URL", "").strip()


def assert_safe_test_database(url: str) -> None:
    if not url:
        raise RuntimeError("SVBK_TEST_DATABASE_URL is required for database-backed tests")
    parsed = urlparse(url.replace("postgresql+psycopg2://", "postgresql://", 1))
    database_name = (parsed.path or "").strip("/").lower()
    host = (parsed.hostname or "").lower()
    if parsed.scheme.startswith("sqlite"):
        if database_name in {"", ":memory:"}:
            return
        if "test" not in database_name:
            raise RuntimeError("SQLite test database filename must contain 'test'")
        return
    if not parsed.scheme.startswith("postgresql"):
        raise RuntimeError("Only PostgreSQL or SQLite test databases are supported")
    if "test" not in database_name:
        raise RuntimeError("Test database name must contain 'test'")
    if host and any(token in host for token in ("render.com", "amazonaws.com", "azure.com")):
        if os.getenv("SVBK_ALLOW_REMOTE_TEST_DB") != "1":
            raise RuntimeError("Remote test databases require SVBK_ALLOW_REMOTE_TEST_DB=1")


if TEST_DATABASE_URL:
    assert_safe_test_database(TEST_DATABASE_URL)
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
else:
    # Existing pure-unit tests import model modules but never connect.
    os.environ.setdefault("DATABASE_URL", "postgresql://svbk_test:svbk_test@127.0.0.1:1/svbk_test_unconfigured")


@pytest.fixture(scope="session")
def test_engine():
    if not TEST_DATABASE_URL:
        pytest.skip("Set SVBK_TEST_DATABASE_URL to run database/API tests")
    assert_safe_test_database(TEST_DATABASE_URL)

    from app.database import Base, engine
    import app.database.models.users
    import app.database.models.criteria
    import app.database.models.helpdesk
    import app.database.models.processing
    import app.database.models.inventory_management
    import app.database.models.general_stock
    import app.database.models.bills
    import app.database.models.attendance
    import app.database.models.requirements
    import app.database.models.payments
    import app.database.models.invoices
    import app.database.models.enterprise_finance
    import app.database.models.gst_models
    import app.database.models.assets
    import app.database.models.advanced_seafood_erp
    import app.database.models.feature_flags
    import app.database.models.system_settings

    Base.metadata.create_all(bind=engine)
    yield engine
    engine.dispose()


def _truncate_test_database(engine) -> None:
    from sqlalchemy import inspect, text

    table_names = list(dict.fromkeys(inspect(engine).get_table_names()))
    if not table_names:
        return
    quoted = ", ".join(f'"{name}"' for name in table_names if name != "alembic_version")
    if not quoted:
        return
    with engine.begin() as connection:
        if engine.dialect.name == "postgresql":
            connection.execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))
        else:
            for table_name in reversed(table_names):
                if table_name != "alembic_version":
                    connection.execute(text(f'DELETE FROM "{table_name}"'))


@pytest.fixture
def clean_database(test_engine):
    _truncate_test_database(test_engine)
    yield
    _truncate_test_database(test_engine)


@pytest.fixture
def db_session(clean_database):
    from app.database import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def client(clean_database, monkeypatch):
    import importlib
    from fastapi.testclient import TestClient
    from app.main import application

    auth_router = importlib.import_module("app.routers.auth")
    monkeypatch.setattr(auth_router, "send_security_email", lambda *args, **kwargs: None)
    monkeypatch.setattr(auth_router, "send_email", lambda *args, **kwargs: None)
    with TestClient(application) as test_client:
        yield test_client


@pytest.fixture
def tenants(db_session):
    from tests.factories import create_tenant_bundle

    tenant_a = create_tenant_bundle(
        db_session,
        code="TSTA0001",
        company_name="Synthetic Tenant Alpha",
        email="admin.alpha@example.test",
        mobile="9000000001",
    )
    tenant_b = create_tenant_bundle(
        db_session,
        code="TSTB0002",
        company_name="Synthetic Tenant Beta",
        email="admin.beta@example.test",
        mobile="9000000002",
    )
    db_session.commit()
    return tenant_a, tenant_b


@pytest.fixture
def login_as(client, db_session):
    from app.database.models.users import OTPTable

    def login(bundle):
        response = client.post("/auth/login", json={
            "company_id": bundle.company.company_code,
            "email": bundle.user.email,
            "password": bundle.password,
        })
        assert response.status_code == 200, response.text
        db_session.expire_all()
        otp = db_session.query(OTPTable).filter(OTPTable.email == bundle.user.email).one()
        response = client.post("/auth/verify-login-otp", json={
            "company_id": bundle.company.company_code,
            "email": bundle.user.email,
            "otp": otp.otp,
        })
        assert response.status_code == 200, response.text
        return response

    return login
