"""Apply the non-destructive export-document compatibility columns."""

import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / ".env")
database_url = os.environ.get("DATABASE_URL")
if not database_url:
    raise RuntimeError("DATABASE_URL is not configured")

statements = [
    f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN NOT NULL DEFAULT FALSE"
    for table in (
        "commercial_invoices",
        "packing_lists",
        "container_stuffing",
        "shipping_bills",
        "bill_of_ladings",
        "health_certificates",
    )
]
statements.extend(
    [
        "ALTER TABLE export_compliance_tracker ADD COLUMN IF NOT EXISTS company_id VARCHAR",
        """UPDATE export_compliance_tracker ect
              SET company_id = es.company_id
             FROM export_shipments es
            WHERE es.shipment_no = ect.shipment_no
              AND ect.company_id IS NULL""",
    ]
)

with psycopg2.connect(database_url) as connection:
    with connection.cursor() as cursor:
        for statement in statements:
            cursor.execute(statement)

print("Export document compatibility schema applied successfully.")
