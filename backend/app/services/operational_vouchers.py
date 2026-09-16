"""Monthly operational vouchers for continuously entered processing labour costs.

Source records remain the operational truth.  This service keeps one editable
voucher per company, contractor, charge type and source month until the tenth
of the following month, while retaining a row-level audit history.
"""
from __future__ import annotations

import calendar
import json
from datetime import date, datetime
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database.models.enterprise_finance import VoucherDetail, VoucherHeader
from app.services.bill_accounting import amount_line
from app.services.posting_engine import PostingEngineService


import logging
import threading

logger = logging.getLogger(__name__)

_OPERATIONAL_SCHEMA_ENSURED = False
_OPERATIONAL_SCHEMA_LOCK = threading.Lock()


def ensure_operational_voucher_schema(db: Session) -> None:
    global _OPERATIONAL_SCHEMA_ENSURED
    if _OPERATIONAL_SCHEMA_ENSURED:
        return

    with _OPERATIONAL_SCHEMA_LOCK:
        if _OPERATIONAL_SCHEMA_ENSURED:
            return

        statements = [
            """
            CREATE TABLE IF NOT EXISTS operational_monthly_vouchers (
                id SERIAL PRIMARY KEY,
                company_id VARCHAR(50) NOT NULL,
                source_type VARCHAR(60) NOT NULL,
                contractor_name VARCHAR(255) NOT NULL,
                period_month DATE NOT NULL,
                voucher_id INTEGER UNIQUE,
                status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
                locked_at TIMESTAMP,
                locked_by VARCHAR(100),
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_operational_monthly_voucher UNIQUE (company_id, source_type, contractor_name, period_month)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS operational_voucher_sources (
                id SERIAL PRIMARY KEY,
                company_id VARCHAR(50) NOT NULL,
                source_type VARCHAR(60) NOT NULL,
                source_table VARCHAR(80) NOT NULL,
                source_record_id INTEGER NOT NULL,
                operational_voucher_id INTEGER REFERENCES operational_monthly_vouchers(id),
                source_date DATE NOT NULL,
                contractor_name VARCHAR(255) NOT NULL,
                taxable_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
                gst_percent NUMERIC(8,2) NOT NULL DEFAULT 0,
                quantity NUMERIC(18,3) NOT NULL DEFAULT 0,
                rate NUMERIC(18,4) NOT NULL DEFAULT 0,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                payload JSONB,
                created_by VARCHAR(100),
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                modified_by VARCHAR(100),
                modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_operational_voucher_source UNIQUE (company_id, source_type, source_table, source_record_id)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS operational_voucher_audits (
                id SERIAL PRIMARY KEY,
                company_id VARCHAR(50) NOT NULL,
                operational_voucher_id INTEGER REFERENCES operational_monthly_vouchers(id),
                source_id INTEGER REFERENCES operational_voucher_sources(id),
                action VARCHAR(30) NOT NULL,
                old_value JSONB,
                new_value JSONB,
                user_email VARCHAR(100) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """,
            "CREATE INDEX IF NOT EXISTS ix_operational_voucher_sources_period ON operational_voucher_sources(company_id, source_type, source_date, is_active)",
            "CREATE INDEX IF NOT EXISTS ix_operational_voucher_audits_source ON operational_voucher_audits(company_id, source_id, created_at DESC)",
        ]
        try:
            for statement in statements:
                db.execute(text(statement))
            db.execute(text("""UPDATE operational_monthly_vouchers
                SET status='LOCKED', locked_at=COALESCE(locked_at, CURRENT_TIMESTAMP),
                    locked_by=COALESCE(locked_by, 'SYSTEM'), updated_at=CURRENT_TIMESTAMP
                WHERE status='OPEN' AND CURRENT_DATE > (period_month + INTERVAL '1 month' + INTERVAL '9 days')"""))
            _OPERATIONAL_SCHEMA_ENSURED = True
        except Exception as exc:
            db.rollback()
            logger.warning("Operational voucher schema check failed: %s", exc)


def _period_month(value: date) -> date:
    return date(value.year, value.month, 1)


def _lock_date(period: date) -> date:
    year, month = (period.year + 1, 1) if period.month == 12 else (period.year, period.month + 1)
    return date(year, month, 10)


def assert_month_open(db: Session, period: date, label: str = "Monthly accounts") -> None:
    """Shared close control for salary and operational monthly inputs."""
    ensure_operational_voucher_schema(db)
    month = _period_month(period)
    if date.today() > _lock_date(month):
        raise ValueError(f"{label} for {month:%b %Y} locked on {_lock_date(month):%d-%b-%Y}")


def _assert_open(db: Session, company_id: str, source_type: str, contractor: str, period: date) -> None:
    row = db.execute(text("""
        SELECT id, status FROM operational_monthly_vouchers
        WHERE company_id=:company_id AND source_type=:source_type
          AND contractor_name=:contractor_name AND period_month=:period_month
        FOR UPDATE
    """), {"company_id": company_id, "source_type": source_type, "contractor_name": contractor, "period_month": period}).mappings().first()
    if row and str(row["status"]).upper() == "LOCKED":
        raise ValueError(f"{source_type} voucher for {period:%b %Y} is locked")
    if date.today() > _lock_date(period):
        if row:
            db.execute(text("""UPDATE operational_monthly_vouchers
                SET status='LOCKED', locked_at=CURRENT_TIMESTAMP, locked_by='SYSTEM', updated_at=CURRENT_TIMESTAMP
                WHERE id=:id"""), {"id": row["id"]})
        raise ValueError(f"{source_type} voucher for {period:%b %Y} locked on {_lock_date(period):%d-%b-%Y}")


def _audit(db: Session, company_id: str, voucher_id: Optional[int], source_id: Optional[int], action: str, old: Optional[dict], new: Optional[dict], email: str) -> None:
    db.execute(text("""INSERT INTO operational_voucher_audits
        (company_id, operational_voucher_id, source_id, action, old_value, new_value, user_email)
        VALUES (:company_id, :voucher_id, :source_id, :action, CAST(:old AS jsonb), CAST(:new AS jsonb), :email)"""), {
        "company_id": company_id, "voucher_id": voucher_id, "source_id": source_id,
        "action": action, "old": json.dumps(old, default=str) if old else None,
        "new": json.dumps(new, default=str) if new else None, "email": email or "SYSTEM",
    })


def _sync_voucher(db: Session, company_id: str, operational_id: int, email: str) -> Optional[VoucherHeader]:
    register = db.execute(text("SELECT * FROM operational_monthly_vouchers WHERE id=:id FOR UPDATE"), {"id": operational_id}).mappings().one()
    sources = db.execute(text("""SELECT * FROM operational_voucher_sources
        WHERE operational_voucher_id=:id AND is_active=TRUE ORDER BY source_date, id"""), {"id": operational_id}).mappings().all()
    taxable = round(sum(float(row["taxable_amount"] or 0) for row in sources), 2)
    gst = round(sum(float(row["taxable_amount"] or 0) * float(row["gst_percent"] or 0) / 100 for row in sources), 2)
    total = round(taxable + gst, 2)
    charge_type = str(register["source_type"]).replace("_", " ").title()
    contractor = str(register["contractor_name"])
    period = register["period_month"]
    ref = f"OMV-{register['id']}-{period:%Y%m}"[:50]
    remarks = f"{charge_type} monthly operational voucher | {period:%b %Y} | {len(sources)} daily source entries"
    details = [
        amount_line(f"{charge_type} Contractor Charges A/c", "Direct Expenses", "EXPENSE", debit=taxable, remarks=remarks),
        amount_line(f"{contractor} - Contractor A/c", "Sundry Creditors", "LIABILITY", credit=total, remarks=ref, parent_group_name="Current Liabilities"),
    ]
    if gst:
        details.insert(1, amount_line("Input GST A/c", "Duties & Taxes", "LIABILITY", debit=gst, remarks=f"Monthly input GST | {ref}", parent_group_name="Current Liabilities"))

    voucher = db.get(VoucherHeader, register["voucher_id"]) if register["voucher_id"] else None
    if not voucher and total > 0:
        voucher = PostingEngineService.create_voucher(db, company_id, "Purchase", period, remarks, details, reference_no=ref, created_by=email or "SYSTEM", status="POSTED")
        db.execute(text("UPDATE operational_monthly_vouchers SET voucher_id=:voucher_id, updated_at=CURRENT_TIMESTAMP WHERE id=:id"), {"voucher_id": voucher.id, "id": operational_id})
        _audit(db, company_id, operational_id, None, "VOUCHER_CREATED", None, {"voucher_id": voucher.id, "total": total, "source_count": len(sources)}, email)
    elif voucher:
        previous = {"voucher_id": voucher.id, "status": voucher.status, "source_count": len(sources)}
        if total <= 0:
            voucher.status = "CANCELLED"
        else:
            PostingEngineService.validate_details(details)
            db.query(VoucherDetail).filter(VoucherDetail.voucher_id == voucher.id).delete(synchronize_session=False)
            for detail in details:
                ledger = PostingEngineService.get_or_create_ledger(db, company_id, detail["ledger_name"], detail["group_name"], detail["group_type"], detail.get("parent_group_name"))
                db.add(VoucherDetail(voucher_id=voucher.id, ledger_id=ledger.id, cost_center_id=detail.get("cost_center_id"), debit_amount=detail["debit_amount"], credit_amount=detail["credit_amount"], remarks=detail.get("remarks")))
            voucher.voucher_date = period
            voucher.reference_no = ref
            voucher.narration = remarks
            voucher.status = "POSTED"
            voucher.modified_by = email or "SYSTEM"
            voucher.modified_at = datetime.utcnow()
        _audit(db, company_id, operational_id, None, "VOUCHER_RECALCULATED", previous, {"voucher_id": voucher.id, "total": total, "source_count": len(sources)}, email)
    return voucher


def upsert_operational_charge(db: Session, *, company_id: str, source_type: str, source_table: str, source_record_id: int, source_date: date, contractor_name: str, taxable_amount: float, gst_percent: float, created_by: str, quantity: float = 0.0, rate: float = 0.0, payload: Optional[dict] = None) -> Optional[VoucherHeader]:
    ensure_operational_voucher_schema(db)
    if not source_date or not contractor_name:
        return None
    period = _period_month(source_date)
    contractor = contractor_name.strip()
    source_type = source_type.strip().upper().replace(" ", "_")
    _assert_open(db, company_id, source_type, contractor, period)
    register = db.execute(text("""INSERT INTO operational_monthly_vouchers (company_id, source_type, contractor_name, period_month)
        VALUES (:company_id,:source_type,:contractor_name,:period_month)
        ON CONFLICT (company_id,source_type,contractor_name,period_month) DO UPDATE SET updated_at=CURRENT_TIMESTAMP
        RETURNING id"""), {"company_id": company_id, "source_type": source_type, "contractor_name": contractor, "period_month": period}).mappings().one()
    old = db.execute(text("""SELECT * FROM operational_voucher_sources WHERE company_id=:company_id AND source_type=:source_type
        AND source_table=:source_table AND source_record_id=:source_record_id"""), {"company_id": company_id, "source_type": source_type, "source_table": source_table, "source_record_id": source_record_id}).mappings().first()
    if old and int(old["operational_voucher_id"]) != int(register["id"]):
        old_register = db.execute(text("SELECT contractor_name, period_month FROM operational_monthly_vouchers WHERE id=:id FOR UPDATE"), {"id": old["operational_voucher_id"]}).mappings().one()
        _assert_open(db, company_id, source_type, old_register["contractor_name"], old_register["period_month"])
    values = {"company_id": company_id, "source_type": source_type, "source_table": source_table, "source_record_id": source_record_id, "operational_voucher_id": register["id"], "source_date": source_date, "contractor_name": contractor, "taxable_amount": round(float(taxable_amount or 0), 2), "gst_percent": round(float(gst_percent or 0), 2), "quantity": float(quantity or 0), "rate": float(rate or 0), "payload": json.dumps(payload or {}), "email": created_by or "SYSTEM"}
    source = db.execute(text("""INSERT INTO operational_voucher_sources (company_id,source_type,source_table,source_record_id,operational_voucher_id,source_date,contractor_name,taxable_amount,gst_percent,quantity,rate,is_active,payload,created_by,modified_by,modified_at)
        VALUES (:company_id,:source_type,:source_table,:source_record_id,:operational_voucher_id,:source_date,:contractor_name,:taxable_amount,:gst_percent,:quantity,:rate,TRUE,CAST(:payload AS jsonb),:email,:email,CURRENT_TIMESTAMP)
        ON CONFLICT (company_id,source_type,source_table,source_record_id) DO UPDATE SET operational_voucher_id=EXCLUDED.operational_voucher_id, source_date=EXCLUDED.source_date, contractor_name=EXCLUDED.contractor_name, taxable_amount=EXCLUDED.taxable_amount, gst_percent=EXCLUDED.gst_percent, quantity=EXCLUDED.quantity, rate=EXCLUDED.rate, is_active=TRUE, payload=EXCLUDED.payload, modified_by=EXCLUDED.modified_by, modified_at=CURRENT_TIMESTAMP
        RETURNING id"""), values).mappings().one()
    _audit(db, company_id, register["id"], source["id"], "SOURCE_INSERT" if not old else "SOURCE_UPDATE", dict(old) if old else None, {k: values[k] for k in ("source_date", "contractor_name", "taxable_amount", "gst_percent", "quantity", "rate")}, created_by)
    if old and int(old["operational_voucher_id"]) != int(register["id"]):
        _sync_voucher(db, company_id, int(old["operational_voucher_id"]), created_by)
    return _sync_voucher(db, company_id, register["id"], created_by)


def deactivate_operational_charge(db: Session, *, company_id: str, source_type: str, source_table: str, source_record_id: int, changed_by: str) -> None:
    ensure_operational_voucher_schema(db)
    source_type = source_type.strip().upper().replace(" ", "_")
    source = db.execute(text("""SELECT s.*, r.period_month, r.contractor_name FROM operational_voucher_sources s
        JOIN operational_monthly_vouchers r ON r.id=s.operational_voucher_id
        WHERE s.company_id=:company_id AND s.source_type=:source_type AND s.source_table=:source_table AND s.source_record_id=:source_record_id FOR UPDATE"""), {"company_id": company_id, "source_type": source_type, "source_table": source_table, "source_record_id": source_record_id}).mappings().first()
    if not source:
        return
    _assert_open(db, company_id, source_type, source["contractor_name"], source["period_month"])
    db.execute(text("UPDATE operational_voucher_sources SET is_active=FALSE, modified_by=:email, modified_at=CURRENT_TIMESTAMP WHERE id=:id"), {"email": changed_by or "SYSTEM", "id": source["id"]})
    _audit(db, company_id, source["operational_voucher_id"], source["id"], "SOURCE_DEACTIVATED", {"is_active": True}, {"is_active": False}, changed_by)
    _sync_voucher(db, company_id, source["operational_voucher_id"], changed_by)
