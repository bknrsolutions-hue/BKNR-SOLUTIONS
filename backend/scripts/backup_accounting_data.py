"""Create a portable CSV ZIP snapshot of accounting tables."""

import io
import json
import sys
import zipfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import inspect, text

from app.database import engine


TABLES = (
    "alembic_version", "voucher_headers", "voucher_details", "finance_audit_trails",
    "ledger_masters", "account_groups", "voucher_types", "financial_year_masters",
    "production_cost_allocations", "commercial_invoices", "packing_lists",
    "payment_receipts", "bill_allocations", "customer_receivables", "vendor_payments",
    "bank_reconciliations", "forex_revaluations",
)


def main(output_path: str):
    target = Path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    inspector = inspect(engine)
    available = set(inspector.get_table_names())
    manifest = {"created_at": datetime.utcnow().isoformat(), "tables": {}}
    raw = engine.raw_connection()
    try:
        with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            cursor = raw.cursor()
            for table in TABLES:
                if table not in available:
                    continue
                stream = io.StringIO()
                cursor.copy_expert(f'COPY "{table}" TO STDOUT WITH CSV HEADER', stream)
                content = stream.getvalue()
                archive.writestr(f"{table}.csv", content)
                with engine.connect() as connection:
                    count = connection.execute(text(f'SELECT count(*) FROM "{table}"')).scalar()
                manifest["tables"][table] = {"rows": count, "file": f"{table}.csv"}
            archive.writestr("manifest.json", json.dumps(manifest, indent=2))
    finally:
        raw.close()
    print(json.dumps({"backup": str(target.resolve()), **manifest}, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: backup_accounting_data.py OUTPUT.zip")
    main(sys.argv[1])
