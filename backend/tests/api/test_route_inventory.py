import pytest

from app.main import application


pytestmark = pytest.mark.api


def _operations():
    schema = application.openapi()
    return {
        (method.upper(), path): operation
        for path, methods in schema["paths"].items()
        for method, operation in methods.items()
        if method.lower() in {"get", "post", "put", "patch", "delete"}
    }


def test_openapi_inventory_contains_real_erp_module_contracts():
    operations = _operations()
    # A floor protects against accidentally dropping entire router groups.
    assert len(operations) >= 100
    expected = {
        ("POST", "/auth/login"),
        ("POST", "/auth/verify-login-otp"),
        ("GET", "/auth/session-info"),
        ("GET", "/processing/gate_entry"),
        ("POST", "/processing/gate_entry"),
        ("GET", "/processing/gate_entry/goods"),
        ("POST", "/processing/gate_entry/goods"),
        ("GET", "/reports/gate_entry"),
    }
    assert expected <= set(operations)


def test_openapi_operation_ids_are_unique_for_client_generation():
    operation_ids = [
        operation.get("operationId")
        for operation in _operations().values()
        if operation.get("operationId")
    ]
    assert len(operation_ids) == len(set(operation_ids))
