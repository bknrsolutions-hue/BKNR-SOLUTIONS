"""Small, idempotent database maintenance for the ERP's high-traffic screens."""
import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


PERFORMANCE_INDEXES = (
    "CREATE INDEX IF NOT EXISTS ix_daily_attendance_company_duty_date ON daily_attendance (company_id, duty_date)",
    "CREATE INDEX IF NOT EXISTS ix_daily_attendance_company_date_ot ON daily_attendance (company_id, duty_date, ot_status) WHERE calculated_ot_hours > 0",
    "CREATE INDEX IF NOT EXISTS ix_employee_registration_company_status ON employee_registration (company_id, status)",
    "CREATE INDEX IF NOT EXISTS ix_audit_log_company_record_time ON audit_log (company_id, table_name, record_id, edited_at DESC)",
    "CREATE INDEX IF NOT EXISTS ix_finance_audit_company_record_time ON finance_audit_trails (company_id, table_name, record_id, timestamp DESC)",
    "CREATE INDEX IF NOT EXISTS ix_cold_storage_company_status_date ON cold_storage_holding (company_id, status, in_date)",
)

ANALYZE_TABLES = (
    "voucher_headers", "voucher_details", "floor_balance", "daily_attendance",
    "employee_registration", "audit_log", "finance_audit_trails", "cold_storage_holding",
)


def apply_database_performance_maintenance(engine: Engine) -> None:
    """Create missing query indexes and refresh PostgreSQL planner statistics."""
    try:
        with engine.begin() as connection:
            for statement in PERFORMANCE_INDEXES:
                connection.execute(text(statement))
            for table_name in ANALYZE_TABLES:
                connection.execute(text(f"ANALYZE {table_name}"))
        logger.info("Database performance indexes and planner statistics refreshed")
    except Exception as exc:
        logger.warning("Database performance maintenance skipped: %s", exc)
