import os
import sys
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

# Add app to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine, SessionLocal
from app.database.models.processing import GateEntry, RawMaterialPurchasing, Production, Peeling, Soaking, DeHeading
from app.database.models.inventory_management import stock_entry, cold_storage_holding, sales_dispatch
from app.database.models.attendance import DailyAttendance, EmployeeRegistration
from app.database.models.payments import CustomerReceivable, VendorPayment, BankTransaction, ExpenseVoucher

def main():
    db = SessionLocal()
    try:
        print("--- Table Counts ---")
        models = [
            ("GateEntry", GateEntry),
            ("RawMaterialPurchasing", RawMaterialPurchasing),
            ("Production", Production),
            ("Peeling", Peeling),
            ("Soaking", Soaking),
            ("DeHeading", DeHeading),
            ("stock_entry", stock_entry),
            ("cold_storage_holding", cold_storage_holding),
            ("sales_dispatch", sales_dispatch),
            ("DailyAttendance", DailyAttendance),
            ("EmployeeRegistration", EmployeeRegistration),
            ("CustomerReceivable", CustomerReceivable),
            ("VendorPayment", VendorPayment),
            ("BankTransaction", BankTransaction),
            ("ExpenseVoucher", ExpenseVoucher),
        ]
        
        for name, model in models:
            count = db.query(model).count()
            print(f"{name}: {count}")
            
        print("\n--- Distinct Varieties in stock_entry ---")
        varieties = db.query(stock_entry.variety).distinct().all()
        print("stock_entry.variety:", [v[0] for v in varieties])

        print("\n--- Distinct Varieties in RawMaterialPurchasing ---")
        rm_varieties = db.query(RawMaterialPurchasing.variety_name).distinct().all()
        print("RawMaterialPurchasing.variety_name:", [v[0] for v in rm_varieties])

        print("\n--- Distinct Varieties in Production ---")
        # Let's inspect Production columns
        inspector = inspect(engine)
        columns = [c['name'] for c in inspector.get_columns('production')]
        print("production columns:", columns)
        if 'variety' in columns:
            prod_vars = db.query(Production.variety).distinct().all()
            print("Production.variety:", [v[0] for v in prod_vars])
        elif 'variety_name' in columns:
            prod_vars = db.query(Production.variety_name).distinct().all()
            print("Production.variety_name:", [v[0] for v in prod_vars])
            
    except Exception as e:
        print("Error:", e)
    finally:
        db.close()

if __name__ == "__main__":
    main()
