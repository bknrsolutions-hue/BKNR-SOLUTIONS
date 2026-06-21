import os
import sys

# Add app to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine, SessionLocal
from app.database.models.inventory_management import cold_storage_holding

def main():
    db = SessionLocal()
    try:
        print("--- Cold Storage Holdings ---")
        holdings = db.query(
            cold_storage_holding.cold_storage_name,
            cold_storage_holding.variety,
            cold_storage_holding.quantity,
            cold_storage_holding.company_id
        ).all()
        for idx, h in enumerate(holdings):
            print(f"[{idx}] cold_storage_name={h.cold_storage_name}, variety={h.variety}, qty={h.quantity}, company_id={h.company_id}")

    except Exception as e:
        print("Error:", e)
    finally:
        db.close()

if __name__ == "__main__":
    main()
