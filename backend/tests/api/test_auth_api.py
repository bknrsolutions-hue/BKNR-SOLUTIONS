from datetime import timedelta

import pytest

from app.database.models.users import OTPTable
from app.routers.auth import get_ist_time


pytestmark = [pytest.mark.api, pytest.mark.auth, pytest.mark.database]


def test_guest_session_probe_is_not_an_error(client):
    response = client.get("/auth/session-info")
    assert response.status_code == 200
    assert response.json() == {"authenticated": False}


def test_login_rejects_invalid_tenant_and_password(client, tenants):
    tenant_a, _ = tenants
    assert client.post("/auth/login", json={
        "company_id": "DOES-NOT-EXIST",
        "email": tenant_a.user.email,
        "password": tenant_a.password,
    }).status_code == 400
    response = client.post("/auth/login", json={
        "company_id": tenant_a.company.company_code,
        "email": tenant_a.user.email,
        "password": "wrong-password",
    })
    assert response.status_code == 400
    assert "password" not in response.text.lower()


def test_verified_login_otp_creates_authenticated_session(client, db_session, tenants, login_as):
    tenant_a, _ = tenants
    login_as(tenant_a)
    response = client.get("/auth/session-info")
    payload = response.json()
    assert response.status_code == 200
    assert payload["authenticated"] is True
    assert payload["company_code"] == tenant_a.company.company_code
    assert payload["email"] == tenant_a.user.email
    assert "password" not in payload
    assert "otp" not in payload


def test_expired_login_otp_is_rejected(client, db_session, tenants):
    tenant_a, _ = tenants
    response = client.post("/auth/login", json={
        "company_id": tenant_a.company.company_code,
        "email": tenant_a.user.email,
        "password": tenant_a.password,
    })
    assert response.status_code == 200
    otp = db_session.query(OTPTable).filter(OTPTable.email == tenant_a.user.email).one()
    otp.created_at = get_ist_time() - timedelta(minutes=11)
    db_session.commit()
    response = client.post("/auth/verify-login-otp", json={
        "company_id": tenant_a.company.company_code,
        "email": tenant_a.user.email,
        "otp": otp.otp,
    })
    assert response.status_code == 400
    assert "expired" in response.text.lower()


def test_inactive_user_cannot_login(client, db_session, tenants):
    tenant_a, _ = tenants
    tenant_a.user.is_active = False
    db_session.commit()
    response = client.post("/auth/login", json={
        "company_id": tenant_a.company.company_code,
        "email": tenant_a.user.email,
        "password": tenant_a.password,
    })
    assert response.status_code == 400
    assert "deactivated" in response.text.lower()


def test_protected_json_endpoint_requires_authentication(client):
    response = client.get("/processing/gate_entry?format=json", headers={"Accept": "application/json"})
    assert response.status_code == 401
    assert response.json()["session_expired"] is True
