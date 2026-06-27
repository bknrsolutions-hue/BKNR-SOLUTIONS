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
    "stock_entry"
]

COLUMNS = [
    ("status", "VARCHAR(50) DEFAULT 'Active'"),
    ("is_cancelled", "BOOLEAN DEFAULT FALSE"),
    ("cancel_reason", "TEXT"),
    ("cancelled_by", "VARCHAR(255)"),
    ("cancelled_at", "TIMESTAMP WITH TIME ZONE")
]

def run_migration():
    print("Starting database schema migration...")
    
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
            
            for col_name, col_type in COLUMNS:
                if col_name not in existing_columns:
                    print(f"  -> Adding column '{col_name}' ({col_type}) to table '{table}'")
                    try:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type};"))
                        print(f"  ✔ Column '{col_name}' added successfully.")
                    except Exception as e:
                        print(f"  ❌ Error adding column '{col_name}': {e}")
                else:
                    print(f"  ✔ Column '{col_name}' already exists in table '{table}'.")
                    
    print("Migration completed successfully!")

if __name__ == "__main__":
    run_migration()
