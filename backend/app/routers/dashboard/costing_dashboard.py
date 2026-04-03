# app/routers/dashboards/costing.py

from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
import logging

from app.database import get_db

# ✅ MODELS IMPORT
from app.database.models.inventory_management import stock_entry, pending_orders
from app.database.models.processing import RawMaterialPurchasing, DeHeading, Peeling
from app.database.models.bills import (
    ElectricityLog, DieselLog, PurchaseInvoice, 
    ContainerLog, QATestingLog, OtherExpense
)
from app.database.models.attendance import EmployeeRegistration
from app.database.models.criteria import production_at

router = APIRouter(tags=["COSTING DASHBOARD"])
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

# ============================================================
# 💰 COSTING DASHBOARD (ALL EXPENSES)
# ============================================================
@router.get("/costing_dashboard", response_class=HTMLResponse)
def costing_dashboard(
    request: Request,
    db: Session = Depends(get_db),
    from_date: str = "",
    to_date: str = ""
):
    # ---------------------------------------------------------
    # 1. SESSION SECURITY
    # ---------------------------------------------------------
    email = request.session.get("email")
    comp_code = request.session.get("company_code")

    if not email or not comp_code:
        return RedirectResponse("/auth/login", status_code=302)

    # ---------------------------------------------------------
    # 2. DATE FILTER HELPERS
    # ---------------------------------------------------------
    def apply_filters(query, model):
        # Always filter by company_id first for security
        query = query.filter(model.company_id == comp_code)
        
        if from_date:
            try:
                query = query.filter(model.date >= date.fromisoformat(from_date))
            except: pass
        if to_date:
            try:
                query = query.filter(model.date <= date.fromisoformat(to_date))
            except: pass
        return query

    # ---------------------------------------------------------
    # 3. CALCULATIONS (Applying Company Filter to all)
    # ---------------------------------------------------------
    try:
        # Raw Material & Processing
        rmp_cost = apply_filters(db.query(func.coalesce(func.sum(RawMaterialPurchasing.amount), 0)), RawMaterialPurchasing).scalar() or 0
        deheading_cost = apply_filters(db.query(func.coalesce(func.sum(DeHeading.amount), 0)), DeHeading).scalar() or 0
        peeling_cost = apply_filters(db.query(func.coalesce(func.sum(Peeling.amount), 0)), Peeling).scalar() or 0

        # Utilities (Joined with production_at for company filtering)
        electricity_cost = db.query(func.coalesce(func.sum(ElectricityLog.total_cost), 0)).join(
            production_at, ElectricityLog.unit_id == production_at.id
        ).filter(production_at.company_id == comp_code).scalar() or 0

        diesel_cost = db.query(func.coalesce(func.sum(DieselLog.net_val), 0)).join(
            production_at, DieselLog.unit_id == production_at.id
        ).filter(production_at.company_id == comp_code).scalar() or 0

        # Logistics & Packaging
        packaging_cost = db.query(func.coalesce(func.sum(PurchaseInvoice.grand_total), 0)).filter(PurchaseInvoice.company_id == comp_code).scalar() or 0
        logistics_cost = db.query(func.coalesce(func.sum(ContainerLog.lended_total), 0)).filter(ContainerLog.company_id == comp_code).scalar() or 0

        # QA & Other Expenses (Join needed if no company_id in table)
        qa_cost = db.query(func.coalesce(func.sum(QATestingLog.test_cost), 0)).join(
            production_at, QATestingLog.unit_id == production_at.id
        ).filter(production_at.company_id == comp_code).scalar() or 0

        other_cost = db.query(func.coalesce(func.sum(OtherExpense.amount), 0)).join(
            production_at, OtherExpense.unit_id == production_at.id
        ).filter(production_at.company_id == comp_code).scalar() or 0

        # Payroll (Monthly Static Projection)
        payroll_cost = db.query(func.coalesce(func.sum(EmployeeRegistration.current_salary), 0)).filter(
            EmployeeRegistration.company_id == comp_code,
            EmployeeRegistration.status == "ACTIVE"
        ).scalar() or 0

        # Inventory & Pending Orders
        inventory_value = db.query(func.coalesce(func.sum(stock_entry.inventory_value), 0)).filter(stock_entry.company_id == comp_code).scalar() or 0
        
        pending_sales = db.query(
            func.coalesce(func.sum(pending_orders.no_of_mc * pending_orders.selling_price * pending_orders.exchange_rate), 0)
        ).filter(pending_orders.company_id == comp_code).scalar() or 0

        # Final Summary
        total_expense = (rmp_cost + deheading_cost + peeling_cost + electricity_cost + diesel_cost + 
                         packaging_cost + logistics_cost + qa_cost + payroll_cost + other_cost)

    except Exception as e:
        logger.error(f"Costing Dashboard Error: {str(e)}")
        total_expense = 0
        # Initialize other variables to 0 if they fail

    # ---------------------------------------------------------
    # 4. RESPONSE
    # ---------------------------------------------------------
    return templates.TemplateResponse(
        request=request,
        name="dashboard/costing_dashboard.html",
        context={
            "company_code": comp_code,
            "email": email,
            "rmp_cost": round(rmp_cost, 2),
            "deheading_cost": round(deheading_cost, 2),
            "peeling_cost": round(peeling_cost, 2),
            "electricity_cost": round(electricity_cost, 2),
            "diesel_cost": round(diesel_cost, 2),
            "packaging_cost": round(packaging_cost, 2),
            "logistics_cost": round(logistics_cost, 2),
            "qa_cost": round(qa_cost, 2),
            "payroll_cost": round(payroll_cost, 2),
            "other_cost": round(other_cost, 2),
            "inventory_value": round(inventory_value, 2),
            "pending_sales": round(pending_sales, 2),
            "total_expense": round(total_expense, 2),
            "from_date": from_date,
            "to_date": to_date,
        }
    )