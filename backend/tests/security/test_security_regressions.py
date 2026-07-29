import io
import importlib
from types import SimpleNamespace

import pytest


pytestmark = [pytest.mark.security, pytest.mark.api, pytest.mark.database]


@pytest.mark.parametrize(
    "path",
    [
        "/processing/gate_entry?format=json",
        "/reports/gate_entry?format=json",
        "/inventory/stock_report?format=json",
        "/data-management/history",
    ],
)
def test_protected_json_routes_reject_guest_sessions(client, path):
    response = client.get(path, headers={"Accept": "application/json"})
    assert response.status_code == 401
    assert response.json()["authenticated"] is False


def test_low_permission_user_is_denied_unassigned_module(client, db_session, tenants, login_as):
    tenant_a, _ = tenants
    tenant_a.user.role = "user"
    tenant_a.user.permissions = "profile"
    db_session.commit()
    login_as(tenant_a)
    response = client.get(
        "/processing/gate_entry?format=json",
        headers={"Accept": "application/json"},
    )
    assert response.status_code == 403
    assert response.json()["required_permission"] == "gate_entry"


def test_sql_injection_style_search_is_treated_as_data(client, tenants, login_as):
    tenant_a, _ = tenants
    login_as(tenant_a)
    response = client.get(
        "/processing/gate_entry/goods",
        params={"search": "' OR 1=1 --"},
        headers={"Accept": "application/json"},
    )
    assert response.status_code == 200
    assert response.json()["rows"] == []


def test_xss_style_search_is_not_reflected_as_executable_markup(client, tenants, login_as):
    tenant_a, _ = tenants
    login_as(tenant_a)
    payload = "<script>window.__svbk_xss=true</script>"
    response = client.get(
        "/processing/gate_entry/goods",
        params={"search": payload},
        headers={"Accept": "application/json"},
    )
    assert response.status_code == 200
    assert payload not in response.text


def test_tenant_logo_rejects_mismatched_file_signature(client, tenants, login_as):
    tenant_a, _ = tenants
    login_as(tenant_a)
    response = client.post(
        "/auth/tenant-logo",
        files={"logo": ("not-an-image.png", io.BytesIO(b"<script>alert(1)</script>"), "image/png")},
        headers={"Accept": "application/json"},
    )
    assert response.status_code in {400, 415, 422}


def test_tenant_logo_url_falls_back_when_uploaded_file_is_missing(monkeypatch, tmp_path):
    auth = importlib.import_module("app.routers.auth")

    monkeypatch.setattr(auth, "APP_DIR", tmp_path)
    company = SimpleNamespace(logo_path="/static/uploads/company_logos/missing.png")

    assert auth.get_company_logo_url(company) == auth.DEFAULT_LOGO_URL


def test_tenant_logo_url_returns_existing_static_upload(monkeypatch, tmp_path):
    auth = importlib.import_module("app.routers.auth")

    monkeypatch.setattr(auth, "APP_DIR", tmp_path)
    logo_file = tmp_path / "static" / "uploads" / "company_logos" / "tenant.png"
    logo_file.parent.mkdir(parents=True)
    logo_file.write_bytes(b"\x89PNG\r\n\x1a\n")
    company = SimpleNamespace(logo_path="/static/uploads/company_logos/tenant.png")

    assert auth.get_company_logo_url(company) == company.logo_path


def test_openapi_does_not_publish_secret_values(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    body = response.text.lower()
    assert "svbk-test-session-secret-not-for-production" not in body
    assert "smtp_password" not in body
    assert "brevo_api_key" not in body
