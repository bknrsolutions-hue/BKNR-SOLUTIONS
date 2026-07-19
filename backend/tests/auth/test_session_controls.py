import pytest


pytestmark = [pytest.mark.auth, pytest.mark.api, pytest.mark.database]


def test_new_login_invalidates_previous_device_session(client, db_session, tenants, login_as):
    from fastapi.testclient import TestClient
    from app.main import application

    tenant_a, _ = tenants
    login_as(tenant_a)
    assert client.get("/auth/session-info").json()["authenticated"] is True

    with TestClient(application) as second_device:
        login = second_device.post("/auth/login", json={
            "company_id": tenant_a.company.company_code,
            "email": tenant_a.user.email,
            "password": tenant_a.password,
        })
        assert login.status_code == 200
        from app.database.models.users import OTPTable
        db_session.expire_all()
        otp = db_session.query(OTPTable).filter(OTPTable.email == tenant_a.user.email).one()
        verified = second_device.post("/auth/verify-login-otp", json={
            "company_id": tenant_a.company.company_code,
            "email": tenant_a.user.email,
            "otp": otp.otp,
        })
        assert verified.status_code == 200
        assert second_device.get("/auth/session-info").json()["authenticated"] is True

    old_session = client.get("/auth/session-info")
    assert old_session.status_code == 401
    assert old_session.json()["session_expired"] is True


def test_logout_clears_active_session(client, tenants, login_as):
    tenant_a, _ = tenants
    login_as(tenant_a)
    response = client.get("/auth/logout", follow_redirects=False)
    assert response.status_code in {200, 303, 307}
    assert client.get("/auth/session-info").json()["authenticated"] is False
