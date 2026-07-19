import pytest

from app.utils.access_control import (
    has_permission,
    normalize_permission,
    required_permission_for_path,
)


pytestmark = pytest.mark.unit


def test_permission_aliases_and_all_permission():
    assert normalize_permission("journal_entries") == "journal_entry"
    assert has_permission({"email": "user@example.test", "permissions": "gate_entry,journal_entries"}, "journal_entry")
    assert has_permission({"email": "user@example.test", "permissions": "ALL"}, "anything")


def test_permission_rules_cover_sensitive_routes():
    assert required_permission_for_path("/processing/gate_entry", "GET") == "gate_entry"
    assert required_permission_for_path("/reports/gate_entry/export_excel", "GET") == "gate_entry_report"
    assert required_permission_for_path("/finance_accounts/journal_entry/entry", "POST") == "journal_entry"


def test_authenticated_master_reads_are_shared_but_writes_are_protected():
    assert required_permission_for_path("/criteria/api/suppliers", "GET") is None
    assert required_permission_for_path("/criteria/api/suppliers", "POST") == "suppliers"
