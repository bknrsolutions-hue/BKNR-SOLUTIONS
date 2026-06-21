import os
import sys

# Add app to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine, SessionLocal
from app.database.models.inventory_management import stock_entry

def main():
    db = SessionLocal()
    try:
        print("--- Stock Entries Samples ---")
        entries = db.query(stock_entry).limit(10).all()
        for idx, entry in enumerate(entries):
            print(f"[{idx}] company_id={entry.company_id}, cargo_movement_type={entry.cargo_movement_type}, variety={entry.variety}, qty={entry.quantity}")
            
        print("\nDistinct company_ids in stock_entry:")
        comp_ids = db.query(stock_entry.company_id).distinct().all()
        print([c[0] for c in comp_ids])

        print("\nDistinct cargo_movement_type in stock_entry:")
        mvt_types = db.query(stock_entry.cargo_movement_type).distinct().all()
        print([m[0] for m in mvt_types])

    except Exception as e:
        print("Error:", e)
    finally:
        db.close()

if __name__ == "__main__":
    main()
