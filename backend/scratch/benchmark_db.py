import sys
import os
from sqlalchemy import text

# Add parent directory to path to import app modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database import SessionLocal

def check_speed_and_plans():
    db = SessionLocal()
    print("==================================================")
    print("🔍 POSTGRESQL INDEX & QUERY PLAN CHECK")
    print("==================================================")
    
    try:
        # Check stock_entry index plan
        res1 = db.execute(text("EXPLAIN SELECT * FROM stock_entry WHERE batch_number = 'BATCH-TEST-123';"))
        print("\n[1] Query Plan for filtering stock_entry by batch_number:")
        for row in res1.fetchall():
            print(f"  {row[0]}")
            
        # Check Join optimization plan
        res2 = db.execute(text("""
            EXPLAIN SELECT s.id, g.id 
            FROM stock_entry s 
            LEFT JOIN gate_entry g ON s.batch_number = g.batch_number 
            LIMIT 50;
        """))
        print("\n[2] Query Plan for stock_entry LEFT JOIN gate_entry:")
        for row in res2.fetchall():
            print(f"  {row[0]}")
            
    except Exception as e:
        print(f"\n❌ Error executing EXPLAIN query: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_speed_and_plans()
