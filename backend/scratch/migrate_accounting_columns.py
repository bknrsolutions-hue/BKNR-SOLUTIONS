import sys
import os
from sqlalchemy import text

# Add backend root to path
sys.path.insert(0, "/Users/nagaraju/Documents/BKNR_ERP/backend")

from app.database import engine

# Define the tables and the columns to check / add
MIGRATIONS = {
    "container_logs": [
        ("status", "VARCHAR(20) DEFAULT 'DRAFT'"),
        ("cost_center_id", "INTEGER"),
        ("journal_id", "INTEGER"),
        ("freight_ledger_id", "INTEGER"),
        ("vendor_ledger_id", "INTEGER"),
        ("input_gst_ledger_id", "INTEGER"),
        ("gst_register_id", "INTEGER"),
    ],
    "qa_testing_logs": [
        ("status", "VARCHAR(20) DEFAULT 'DRAFT'"),
        ("cost_center_id", "INTEGER"),
        ("journal_id", "INTEGER"),
        ("qa_expense_ledger_id", "INTEGER"),
        ("lab_ledger_id", "INTEGER"),
        ("input_gst_ledger_id", "INTEGER"),
        ("gst_register_id", "INTEGER"),
    ],
    "other_expenses": [
        ("status", "VARCHAR(20) DEFAULT 'DRAFT'"),
        ("cost_center_id", "INTEGER"),
        ("journal_id", "INTEGER"),
        ("expense_ledger_id", "INTEGER"),
        ("cash_or_bank_ledger_id", "INTEGER"),
        ("gst_register_id", "INTEGER"),
    ]
}

def run_db_migration():
    print("=========================================================================")
    print("▶ RUNNING DATABASE ACCOUNTING COLUMNS SCHEMAS MIGRATION")
    print("=========================================================================")
    
    with engine.begin() as conn:
        for table, columns in MIGRATIONS.items():
            print(f"\nChecking table: {table}")
            
            # Fetch existing columns using catalog query
            res = conn.execute(text(f"""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = '{table}';
            """))
            existing_columns = {row[0].lower() for row in res.fetchall()}
            
            for col_name, col_type in columns:
                if col_name.lower() not in existing_columns:
                    print(f"  -> Adding missing column '{col_name}' ({col_type}) to table '{table}'")
                    try:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type};"))
                        print(f"  ✔ Column '{col_name}' added successfully.")
                    except Exception as e:
                        print(f"  ❌ Error adding column '{col_name}': {e}")
                else:
                    print(f"  ✔ Column '{col_name}' already exists.")
                    
    print("\n=========================================================================")
    print("▶ DATABASE COLUMNS MIGRATION COMPLETED!")
    print("=========================================================================")

if __name__ == "__main__":
    run_db_migration()
