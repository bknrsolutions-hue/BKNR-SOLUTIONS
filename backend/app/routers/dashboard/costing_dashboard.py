from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date

from app.database import get_db

# ✅ INVENTORY MODELS
from app.database.models.inventory_management import (
    stock_entry,
    pending_orders
)

# ✅ PROCESSING MODELS
from app.database.models.processing import (
    RawMaterialPurchasing,
    DeHeading,
    Peeling,
    Grading,
    Soaking,
    Production
)

# ✅ BILLS / ACCOUNTS MODELS
from app.database.models.bills import (
    ElectricityLog,
    DieselLog,
    PurchaseInvoice,
    ContainerLog,
    QATestingLog,
    OtherExpense
)

# ✅ HR
from app.database.models.attendance import EmployeeRegistration

router = APIRouter(tags=["COSTING DASHBOARD"])


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
    def date_filter(q, model):
        if from_date:
            q = q.filter(model.date >= date.fromisoformat(from_date))
        if to_date:
            q = q.filter(model.date <= date.fromisoformat(to_date))
        return q

    # ---------------------------------------------------------
    # 3. RAW MATERIAL COST
    # ---------------------------------------------------------
    rmp_cost = date_filter(
        db.query(func.coalesce(func.sum(RawMaterialPurchasing.amount), 0))
        .filter(RawMaterialPurchasing.company_id == comp_code),
        RawMaterialPurchasing
    ).scalar() or 0

    # ---------------------------------------------------------
    # 4. PROCESSING COST
    # ---------------------------------------------------------
    deheading_cost = date_filter(
        db.query(func.coalesce(func.sum(DeHeading.amount), 0))
        .filter(DeHeading.company_id == comp_code),
        DeHeading
    ).scalar() or 0

    peeling_cost = date_filter(
        db.query(func.coalesce(func.sum(Peeling.amount), 0))
        .filter(Peeling.company_id == comp_code),
        Peeling
    ).scalar() or 0

    # ---------------------------------------------------------
    # 5. UTILITIES
    # ---------------------------------------------------------
    electricity_cost = db.query(
        func.coalesce(func.sum(ElectricityLog.total_cost), 0)
    ).scalar() or 0

    diesel_cost = db.query(
        func.coalesce(func.sum(DieselLog.net_val), 0)
    ).scalar() or 0

    # ---------------------------------------------------------
    # 6. PACKAGING & LOGISTICS
    # ---------------------------------------------------------
    packaging_cost = db.query(
        func.coalesce(func.sum(PurchaseInvoice.grand_total), 0)
    ).filter(PurchaseInvoice.company_id == comp_code).scalar() or 0

    logistics_cost = db.query(
        func.coalesce(func.sum(ContainerLog.lended_total), 0)
    ).filter(ContainerLog.company_id == comp_code).scalar() or 0

    # ---------------------------------------------------------
    # 7. QA + OTHER EXPENSES
    # ---------------------------------------------------------
    qa_cost = db.query(
        func.coalesce(func.sum(QATestingLog.test_cost), 0)
    ).scalar() or 0

    other_cost = db.query(
        func.coalesce(func.sum(OtherExpense.amount), 0)
    ).scalar() or 0

    # ---------------------------------------------------------
    # 8. PAYROLL
    # ---------------------------------------------------------
    payroll_cost = db.query(
        func.coalesce(func.sum(EmployeeRegistration.current_salary), 0)
    ).filter(
        EmployeeRegistration.company_id == comp_code,
        EmployeeRegistration.status == "ACTIVE"
    ).scalar() or 0

    # ---------------------------------------------------------
    # 9. INVENTORY VALUE
    # ---------------------------------------------------------
    inventory_value = db.query(
        func.coalesce(func.sum(stock_entry.inventory_value), 0)
    ).filter(stock_entry.company_id == comp_code).scalar() or 0

    # ---------------------------------------------------------
    # 10. PENDING SALES
    # ---------------------------------------------------------
    pending_sales = db.query(
        func.coalesce(
            func.sum(
                pending_orders.no_of_mc *
                pending_orders.selling_price *
                pending_orders.exchange_rate
            ), 0
        )
    ).filter(pending_orders.company_id == comp_code).scalar() or 0

    # ---------------------------------------------------------
    # 11. TOTAL EXPENSE
    # ---------------------------------------------------------
    total_expense = (
        rmp_cost +
        deheading_cost +
        peeling_cost +
        electricity_cost +
        diesel_cost +
        packaging_cost +
        logistics_cost +
        qa_cost +
        payroll_cost +
        other_cost
    )

    # ---------------------------------------------------------
    # 12. RESPONSE
    # ---------------------------------------------------------
    return request.app.state.templates.TemplateResponse(
        "dashboard/costing_dashboard.html",
        {
            "request": request,
            "company_code": comp_code,

            # COSTS
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

            # KPIs
            "inventory_value": round(inventory_value, 2),
            "pending_sales": round(pending_sales, 2),
            "total_expense": round(total_expense, 2),

            # FILTERS
            "from_date": from_date,
            "to_date": to_date,
        }
    )
