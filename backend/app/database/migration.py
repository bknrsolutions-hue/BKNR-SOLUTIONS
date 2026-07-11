import sys
import os
from sqlalchemy import text

# Add the parent directory to the path so we can import app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from app.database import engine

TABLES = [
    "gate_entry",
    "raw_material_purchasing",
    "de_heading",
    "grading",
    "peeling",
    "soaking",
    "production",
    "stock_entry",
    "electricity_logs",
    "diesel_logs",
    "purchase_invoices",
    "container_logs",
    "qa_testing_logs",
    "other_expenses",
    "general_stock",
    "customer_receivables",
    "vendor_payments",
    "bank_transactions",
    "expense_vouchers",
    "journal_entries",
    "payment_receipts",
    "gst_register",
    "fixed_asset_masters",
    "export_incentive_register",
    "lc_tracking",
    "salary_processing",
    "production_cost_allocations",
    "commercial_invoices"
]

COLUMNS = [
    ("status", "VARCHAR(50) DEFAULT 'Active'"),
    ("is_cancelled", "BOOLEAN DEFAULT FALSE"),
    ("cancel_reason", "TEXT"),
    ("cancelled_by", "VARCHAR(255)"),
    ("cancelled_at", "TIMESTAMP WITH TIME ZONE")
]

TABLE_COLUMNS = {
    "gate_entry": [
        ("driver_name", "VARCHAR(255)"),
    ],
    "customer_receivables": [
        ("journal_id", "INTEGER"),
    ],
    "bank_transactions": [
        ("journal_id", "INTEGER"),
    ],
    "expense_vouchers": [
        ("journal_id", "INTEGER"),
    ],
    "diesel_logs": [
        ("journal_id", "INTEGER"),
    ],
    "purchase_invoices": [
        ("journal_id", "INTEGER"),
    ],
    "container_logs": [
        ("journal_id", "INTEGER"),
    ],
    "qa_testing_logs": [
        ("journal_id", "INTEGER"),
        ("product_name", "VARCHAR(150)"),
        ("parameters", "TEXT"),
    ],
    "other_expenses": [
        ("journal_id", "INTEGER"),
    ],
    "commercial_invoices": [
        ("journal_id", "INTEGER"),
        ("customer_ledger_id", "INTEGER"),
        ("sales_ledger_id", "INTEGER"),
    ],
    "sales_dispatch": [
        ("journal_id", "INTEGER"),
    ],
    "de_heading": [
        ("journal_id", "INTEGER"),
    ],
    "peeling": [
        ("journal_id", "INTEGER"),
    ],
    "daily_attendance": [
        ("journal_id", "INTEGER"),
        ("approved_duty_credit", "DOUBLE PRECISION DEFAULT 0"),
    ],
    "salary_processing": [
        ("salary_journal_id", "INTEGER"),
        ("payment_journal_id", "INTEGER"),
        ("payment_date", "DATE"),
        ("utr_reference", "VARCHAR(50)"),
        ("paid_amount", "DOUBLE PRECISION DEFAULT 0"),
    ],
    "journal_entries": [
        ("journal_id", "INTEGER"),
    ],
    "payment_receipts": [
        ("journal_id", "INTEGER"),
    ],
    "general_stock": [
        ("invoice_number", "VARCHAR(100)"),
        ("unit_id", "INTEGER"),
        ("production_at", "VARCHAR(255)"),
        ("po_number", "VARCHAR(100)"),
        ("vendor_id", "INTEGER"),
        ("vendor_name", "VARCHAR(255)"),
        ("hsn_code", "VARCHAR(50)"),
        ("gst_percent", "DOUBLE PRECISION DEFAULT 0"),
        ("tax_amount", "DOUBLE PRECISION DEFAULT 0"),
        ("total_amount", "DOUBLE PRECISION DEFAULT 0"),
        ("accounting_ledger_id", "INTEGER"),
        ("rate", "DOUBLE PRECISION DEFAULT 0"),
        ("amount", "DOUBLE PRECISION DEFAULT 0"),
        ("journal_id", "INTEGER"),
    ],
}

def run_migration():
    print("Starting database schema migration...")
    
    # Auto-create all metadata tables (e.g. system_settings, feature_flags, etc) if they do not exist
    try:
        import app.database.models.feature_flags
        import app.database.models.system_settings
        from app.database import Base
        Base.metadata.create_all(bind=engine)
        print("  ✔ Table creation check: completed successfully.")
    except Exception as e:
        print(f"  ❌ Error checking/creating tables: {e}")

    with engine.begin() as conn:
        for table in TABLES:
            print(f"Checking table: {table}")
            
            # Check existing columns using PostgreSQL catalog
            res = conn.execute(text(f"""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = '{table}';
            """))
            existing_columns = {row[0] for row in res.fetchall()}
            
            for col_name, col_type in COLUMNS + TABLE_COLUMNS.get(table, []):
                if col_name not in existing_columns:
                    print(f"  -> Adding column '{col_name}' ({col_type}) to table '{table}'")
                    try:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type};"))
                        print(f"  ✔ Column '{col_name}' added successfully.")
                    except Exception as e:
                        print(f"  ❌ Error adding column '{col_name}': {e}")
                else:
                    print(f"  ✔ Column '{col_name}' already exists in table '{table}'.")
        
        # Check users table
        print("Checking table: users")
        res = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users';
        """))
        existing_user_columns = {row[0] for row in res.fetchall()}
        
        user_migrations = [
            ("is_active", "BOOLEAN DEFAULT TRUE"),
            ("data_management_access", "BOOLEAN DEFAULT FALSE"),
            ("ui_colors", "TEXT"),
            ("current_session_id", "VARCHAR")
        ]
        
        for col_name, col_type in user_migrations:
            if col_name not in existing_user_columns:
                print(f"  -> Adding column '{col_name}' ({col_type}) to table 'users'")
                try:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type};"))
                    print(f"  ✔ Column '{col_name}' added successfully to users table.")
                except Exception as e:
                    print(f"  ❌ Error adding column '{col_name}' to users table: {e}")
            else:
                print(f"  ✔ Column '{col_name}' already exists in table 'users'.")
                    
    print("Migration completed successfully!")

if __name__ == "__main__":
    run_migration()
