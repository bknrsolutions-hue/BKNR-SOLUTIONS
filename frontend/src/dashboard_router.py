from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, desc
from datetime import date, timedelta

from app.database import get_db
# NOTE: The following model imports are assumptions based on your application structure.
# Please verify that these paths and model names are correct.
from app.database.models.attendance import EmployeeRegistration, DailyAttendance
from app.database.models.processing import Grading, Peeling, Production, DeHeading, RawMaterialPurchasing
from app.database.models.inventory_management import StockEntry, Sales, ColdStorageHolding
from app.database.models.payments import CustomerReceivable, VendorPayment
from app.database.models.enterprise_finance import LedgerMaster, VoucherHeader
from app.database.models.bills import PurchaseInvoice, ContainerLog, QATestingLog, OtherExpense, ElectricityLog, DieselLog

router = APIRouter()

def get_company_id(request: Request):
    """Helper to get company_id and handle unauthorized access."""
    company_id = request.session.get("company_code")
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return company_id

@router.get("/hr-metrics")
def get_hr_metrics(request: Request, db: Session = Depends(get_db)):
    """Provides metrics for the HR Command Center dashboard."""
    company_id = get_company_id(request)
    today = date.today()

    total_staff = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.company_id == company_id,
        EmployeeRegistration.status == "ACTIVE"
    ).count()

    # Assuming duty_status 'PRESENT' or 'APPROVED' means present.
    attendance_rows = db.query(DailyAttendance).join(
        EmployeeRegistration, DailyAttendance.employee_id == EmployeeRegistration.employee_id
    ).filter(
        EmployeeRegistration.company_id == company_id,
        DailyAttendance.duty_date == today
    ).all()
    
    present_today = len(attendance_rows)
    # Assuming 'PRESENT' status means currently inside the facility.
    inside_now = len([r for r in attendance_rows if r.duty_status == "PRESENT"])
    
    departmental_deployment = db.query(
        EmployeeRegistration.department, 
        func.count(DailyAttendance.id)
    ).join(
        DailyAttendance, EmployeeRegistration.employee_id == DailyAttendance.employee_id
    ).filter(
        EmployeeRegistration.company_id == company_id, 
        DailyAttendance.duty_date == today
    ).group_by(EmployeeRegistration.department).all()

    return {
        "summary": {
            "total_staff": total_staff,
            "present_today": present_today,
            "attendance_rate": round((present_today / total_staff * 100), 1) if total_staff > 0 else 0,
            "inside_now": inside_now,
            "absent_today": total_staff - present_today,
        },
        "departmental_deployment": [
            {"dept": d[0] or "Uncategorized", "count": d[1]} for d in departmental_deployment
        ]
    }

@router.get("/processing-metrics")
def get_processing_metrics(request: Request, db: Session = Depends(get_db)):
    """Provides metrics for the Processing dashboard. (Placeholder)"""
    company_id = get_company_id(request)
    today = date.today()
    
    # NOTE: These are placeholder queries. Please verify with your actual models.
    # The 'company_id' filter is commented out as its existence in these models is unconfirmed.
    rmp_today = db.query(func.sum(RawMaterialPurchasing.net_weight)).filter(
        # RawMaterialPurchasing.company_id == company_id,
        RawMaterialPurchasing.date == today
    ).scalar() or 0

    production_today = db.query(func.sum(Production.total_quantity)).filter(
        # Production.company_id == company_id,
        Production.date == today
    ).scalar() or 0

    return {
        "summary": {
            "rm_purchased": rmp_today,
            "finished_goods": production_today,
            "yield_percentage": round((production_today / rmp_today * 100), 1) if rmp_today > 0 else 0,
        },
        "recent_activity": [] # Placeholder for recent transactions
    }

@router.get("/inventory-metrics")
def get_inventory_metrics(request: Request, db: Session = Depends(get_db)):
    """Provides metrics for the Inventory dashboard. (Placeholder)"""
    company_id = get_company_id(request)
    # Placeholder logic
    return {"summary": {}, "stock_by_location": []}

@router.get("/costing-metrics")
def get_costing_metrics(request: Request, db: Session = Depends(get_db)):
    """Provides metrics for the Costing dashboard. (Placeholder)"""
    company_id = get_company_id(request)
    # Placeholder logic
    return {"summary": {}, "cost_breakdown": []}

@router.get("/finance-metrics")
def get_finance_metrics(request: Request, db: Session = Depends(get_db)):
    """Provides metrics for the Finance dashboard. (Placeholder)"""
    company_id = get_company_id(request)
    
    receivables = db.query(func.sum(CustomerReceivable.balance_amount)).filter(
        CustomerReceivable.company_id == company_id,
        CustomerReceivable.payment_status != 'PAID'
    ).scalar() or 0

    payables = db.query(func.sum(VendorPayment.balance)).filter(
        VendorPayment.company_id == company_id,
        VendorPayment.status != 'PAID'
    ).scalar() or 0

    return {
        "summary": {
            "total_receivables": receivables,
            "total_payables": payables,
        },
        "cash_flow": []
    }

@router.get("/tally-metrics")
def get_tally_metrics(request: Request, db: Session = Depends(get_db)):
    """Provides metrics for the Tally dashboard. (Placeholder)"""
    company_id = get_company_id(request)
    # Placeholder logic
    return {"summary": {}, "profit_loss": {}}