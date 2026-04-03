# ============================================================
# STORAGE & HOLDING COST REPORT ROUTER (BKNR ERP)
# ============================================================

from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import date, datetime
from typing import Optional

from app.database import get_db
from app.database.models.inventory_management import stock_entry as Inventory
from app.database.models.criteria import production_for as ProductionFor

router = APIRouter(
    tags=["STORAGE COST REPORT"]
)

templates = Jinja2Templates(directory="app/templates")

@router.get("/storage_cost_report", response_class=HTMLResponse)
def storage_cost_report(
    request: Request,
    production_for: Optional[str] = "",
    production_at: Optional[str] = "",
    freezer: Optional[str] = "",
    from_date: Optional[str] = "",
    to_date: Optional[str] = "",
    db: Session = Depends(get_db)
):
    # -------------------------------------------------
    # 🔐 SESSION & SECURITY CHECK
    # -------------------------------------------------
    user_email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not user_email or not company_code:
        return RedirectResponse("/auth/login", status_code=302)

    # -------------------------------------------------
    # BASE QUERY (Filtering 'IN' movements only)
    # -------------------------------------------------
    q = (
        db.query(Inventory)
        .filter(
            Inventory.cargo_movement_type == "IN",
            Inventory.company_id == company_code
        )
    )

    # Apply Dynamic Filters
    if production_for:
        q = q.filter(Inventory.production_for == production_for)
    if production_at:
        q = q.filter(Inventory.production_at == production_at)
    if freezer:
        q = q.filter(Inventory.freezer == freezer)
    if from_date:
        q = q.filter(Inventory.date >= datetime.strptime(from_date, "%Y-%m-%d").date())
    if to_date:
        q = q.filter(Inventory.date <= datetime.strptime(to_date, "%Y-%m-%d").date())

    rows = q.order_by(Inventory.date.desc()).all()

    # -------------------------------------------------
    # REPORT CALCULATION ENGINE
    # -------------------------------------------------
    report_data = []
    total_payable_sum = 0.0
    total_holding_sum = 0.0
    total_qty_sum = 0.0
    today = date.today()

    for r in rows:
        qty = float(r.quantity or 0)
        total_qty_sum += qty
        stock_date = r.date

        # 🔍 LOOKUP COST FROM MASTER (Finding the latest rate applicable for that stock date)
        costing = (
            db.query(ProductionFor)
            .filter(
                ProductionFor.company_id == company_code,
                ProductionFor.production_for == r.production_for,
                ProductionFor.freezer_name == r.freezer,
                ProductionFor.glaze_percent == r.glaze,
                ProductionFor.apply_from <= stock_date
            )
            .order_by(ProductionFor.apply_from.desc())
            .first()
        )

        # ✅ PRODUCTION / GLAZE COST CALC
        prod_cost_per_kg = float(costing.production_cost_per_kg) if costing else 0.0
        payable_amount = qty * prod_cost_per_kg
        total_payable_sum += payable_amount

        # 🧊 HOLDING COST CALCULATION
        total_days = (today - stock_date).days
        free_days = int(costing.free_days) if costing else 0
        chargeable_days = max(0, total_days - free_days)

        rate_per_mc_day = float(costing.rate_per_mc_day) if costing else 0.0
        no_of_mc = float(r.no_of_mc or 0)

        holding_cost = round(chargeable_days * rate_per_mc_day * no_of_mc, 2)
        total_holding_sum += holding_cost

        # Append Processed Row
        report_data.append({
            "date": r.date,
            "batch_number": r.batch_number,
            "production_for": r.production_for,
            "production_at": r.production_at,
            "freezer": r.freezer,
            "glaze": r.glaze,
            "variety": r.variety,
            "quantity": round(qty, 2),
            "no_of_mc": no_of_mc,
            "prod_cost_per_kg": round(prod_cost_per_kg, 2),
            "payable_amount": round(payable_amount, 2),
            "total_days": total_days,
            "free_days": free_days,
            "chargeable_days": chargeable_days,
            "holding_cost_per_mc_day": round(rate_per_mc_day, 2),
            "holding_cost": holding_cost
        })

    # -------------------------------------------------
    # FILTER LOOKUPS (For Searchable Columns)
    # -------------------------------------------------
    def get_distinct_list(column):
        return sorted([x[0] for x in db.query(column).filter(Inventory.company_id == company_code).distinct().all() if x[0]])

    # -------------------------------------------------
    # RENDER RESPONSE
    # -------------------------------------------------
    return templates.TemplateResponse(
        request,
        "reports/storage_report.html",
        {
            "report_data": report_data,
            "total_payable_sum": round(total_payable_sum, 2),
            "total_holding_sum": round(total_holding_sum, 2),
            "total_qty_sum": round(total_qty_sum, 2),
            "production_for_list": get_distinct_list(Inventory.production_for),
            "production_at_list": get_distinct_list(Inventory.production_at),
            "freezers_list": get_distinct_list(Inventory.freezer),
            "selected_for": production_for,
            "selected_at": production_at,
            "selected_freezer": freezer,
            "from_date": from_date,
            "to_date": to_date
        }
    )