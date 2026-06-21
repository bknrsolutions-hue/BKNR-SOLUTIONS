import sys
import os
from datetime import date, datetime, timedelta

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.database.models.payments import CustomerReceivable, VendorPayment, BankTransaction, ExpenseVoucher
from app.database.models.users import Company

def seed():
    db = SessionLocal()
    try:
        companies = db.query(Company).all()
        if not companies:
            print("No companies found in database. Seed companies first.")
            return
        
        company_codes = [c.company_code for c in companies]
        print("Seeding finance data for companies:", company_codes)

        # Clear existing finance data to avoid duplicates
        db.query(CustomerReceivable).delete()
        db.query(VendorPayment).delete()
        db.query(BankTransaction).delete()
        db.query(ExpenseVoucher).delete()
        db.commit()

        today = date.today()

        for code in company_codes:
            # 1. Customer Receivables (A/R)
            receivables = [
                CustomerReceivable(
                    company_id=code,
                    invoice_no=f"INV-{code}-2026-0001",
                    po_number="PO-99281",
                    buyer_name="Apex Oceanic Imports LLC",
                    buyer_type="Direct Buyer",
                    country="USA",
                    invoice_date=today - timedelta(days=45),
                    currency="USD",
                    exchange_rate=83.5,
                    invoice_value_foreign=60000.0,
                    invoice_value_inr=5010000.0,
                    received_amount=3010000.0,
                    balance_amount=2000000.0,
                    payment_status="PARTIAL",
                    status="OPEN",
                    due_date=today - timedelta(days=15),
                    aging_days=15,
                    risk_status="OVERDUE",
                    created_by="system_seed"
                ),
                CustomerReceivable(
                    company_id=code,
                    invoice_no=f"INV-{code}-2026-0002",
                    po_number="PO-99282",
                    buyer_name="ZenITH Seafood Dist Inc",
                    buyer_type="Distributor",
                    country="Japan",
                    invoice_date=today - timedelta(days=20),
                    currency="USD",
                    exchange_rate=83.5,
                    invoice_value_foreign=40000.0,
                    invoice_value_inr=3340000.0,
                    received_amount=0.0,
                    balance_amount=3340000.0,
                    payment_status="PENDING",
                    status="OPEN",
                    due_date=today + timedelta(days=10),
                    aging_days=0,
                    risk_status="CLEAN",
                    created_by="system_seed"
                ),
                CustomerReceivable(
                    company_id=code,
                    invoice_no=f"INV-{code}-2026-0003",
                    po_number="PO-99283",
                    buyer_name="EuroFood Brokers Ltd",
                    buyer_type="Broker",
                    country="Spain",
                    invoice_date=today - timedelta(days=10),
                    currency="USD",
                    exchange_rate=83.5,
                    invoice_value_foreign=25000.0,
                    invoice_value_inr=2087500.0,
                    received_amount=2087500.0,
                    balance_amount=0.0,
                    payment_status="PAID",
                    status="CLOSED",
                    due_date=today + timedelta(days=20),
                    aging_days=0,
                    risk_status="CLEAN",
                    created_by="system_seed",
                    received_date=today - timedelta(days=2)
                )
            ]
            db.add_all(receivables)

            # 2. Vendor Payments (A/P)
            payments = [
                VendorPayment(
                    company_id=code,
                    vendor_name="Gautami Seafood Logistics",
                    vendor_type="Logistics",
                    gst_no="37AAFBC2019Z1Z8",
                    vendor_invoice_no="GSL-9827",
                    bill_no=f"VOU-{code}-2026-0001",
                    bill_date=today - timedelta(days=25),
                    due_date=today + timedelta(days=5),
                    total_amount=450000.0,
                    gst_amount=81000.0,
                    tds_amount=9000.0,
                    paid_amount=0.0,
                    balance=450000.0,
                    status="Unpaid",
                    created_by="system_seed"
                ),
                VendorPayment(
                    company_id=code,
                    vendor_name="Visakha Block Ice Co",
                    vendor_type="Ice Vendor",
                    gst_no="37AAFBC5010Z2Z9",
                    vendor_invoice_no="VBI-5421",
                    bill_no=f"VOU-{code}-2026-0002",
                    bill_date=today - timedelta(days=15),
                    due_date=today - timedelta(days=5),
                    total_amount=150000.0,
                    gst_amount=27000.0,
                    tds_amount=3000.0,
                    paid_amount=50000.0,
                    balance=100000.0,
                    status="Partially Paid",
                    created_by="system_seed"
                ),
                VendorPayment(
                    company_id=code,
                    vendor_name="Sri Durga Peeling Contractors",
                    vendor_type="Contractor",
                    gst_no=None,
                    vendor_invoice_no="SDP-APR26",
                    bill_no=f"VOU-{code}-2026-0003",
                    bill_date=today - timedelta(days=5),
                    due_date=today + timedelta(days=25),
                    total_amount=850000.0,
                    gst_amount=0.0,
                    tds_amount=8500.0,
                    paid_amount=850000.0,
                    balance=0.0,
                    status="Paid",
                    created_by="system_seed",
                    payment_date=today - timedelta(days=1),
                    payment_mode="RTGS",
                    transaction_no="RTGS-983726189"
                )
            ]
            db.add_all(payments)

            # 3. Bank Transactions
            transactions = [
                BankTransaction(
                    company_id=code,
                    bank_name="HDFC Corporate Bank",
                    transaction_date=today - timedelta(days=30),
                    voucher_type="CONTRA",
                    reference_no=f"TXN-{code}-0001",
                    debit=5000000.0,
                    credit=0.0,
                    closing_balance=12500000.0,
                    narration="Initial Corporate Funding Transfer",
                    created_by="system_seed"
                ),
                BankTransaction(
                    company_id=code,
                    bank_name="HDFC Corporate Bank",
                    transaction_date=today - timedelta(days=15),
                    voucher_type="RECEIPT",
                    reference_no=f"TXN-{code}-0002",
                    debit=2087500.0,
                    credit=0.0,
                    closing_balance=14587500.0,
                    linked_invoice_no=f"INV-{code}-2026-0003",
                    narration="Settlement of Invoice INV-0003 - EuroFood Ltd",
                    created_by="system_seed"
                ),
                BankTransaction(
                    company_id=code,
                    bank_name="HDFC Corporate Bank",
                    transaction_date=today - timedelta(days=1),
                    voucher_type="PAYMENT",
                    reference_no=f"TXN-{code}-0003",
                    debit=0.0,
                    credit=850000.0,
                    closing_balance=13737500.0,
                    linked_vendor="Sri Durga Peeling Contractors",
                    narration="RTGS settlement for April Peeling logs",
                    created_by="system_seed"
                )
            ]
            db.add_all(transactions)

            # 4. Expense Vouchers
            vouchers = [
                ExpenseVoucher(
                    company_id=code,
                    voucher_no=f"EXP-{code}-2026-0001",
                    voucher_date=today - timedelta(days=18),
                    expense_type="Diesel & Fuel",
                    department="Production",
                    vendor_name="HP Fuel Outlet Vizag",
                    gst_percentage=18.0,
                    gst_amount=9000.0,
                    amount=50000.0,
                    total_amount=59000.0,
                    approved_by="Executive Admin",
                    payment_mode="Bank Transfer",
                    status="APPROVED"
                ),
                ExpenseVoucher(
                    company_id=code,
                    voucher_no=f"EXP-{code}-2026-0002",
                    voucher_date=today - timedelta(days=8),
                    expense_type="Staff Welfare",
                    department="Admin",
                    vendor_name="Sowmya Caterers",
                    gst_percentage=5.0,
                    gst_amount=1250.0,
                    amount=25000.0,
                    total_amount=26250.0,
                    approved_by="HR Lead",
                    payment_mode="Cash",
                    status="APPROVED"
                ),
                ExpenseVoucher(
                    company_id=code,
                    voucher_no=f"EXP-{code}-2026-0003",
                    voucher_date=today - timedelta(days=3),
                    expense_type="QA Testing Charges",
                    department="QA Lab",
                    vendor_name="SGS Labs Visakhapatnam",
                    gst_percentage=18.0,
                    gst_amount=14400.0,
                    amount=80000.0,
                    total_amount=94400.0,
                    approved_by="Quality Assurance Mgr",
                    payment_mode="Bank Transfer",
                    status="APPROVED"
                )
            ]
            db.add_all(vouchers)

        db.commit()
        print("Successfully seeded all companies with mock finance ledger data!")
    except Exception as e:
        db.rollback()
        print("Error during seed:", e)
    finally:
        db.close()

if __name__ == "__main__":
    seed()
