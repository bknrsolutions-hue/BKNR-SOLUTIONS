from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import date

from app.database import get_db
from app.database.models.inventory_management import stock_entry as Inventory
from app.database.models.criteria import production_for as ProductionFor

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/storage_cost_report", response_class=HTMLResponse)
def storage_cost_report(
    request: Request,
    production_for: str = "",
    production_at: str = "",
    freezer: str = "",
    from_date: str = "",
    to_date: str = "",
    db: Session = Depends(get_db)
):
    # -------------------------------------------------
    # 🔐 SESSION CHECK
    # -------------------------------------------------
    if not request.session.get("email"):
        return RedirectResponse("/", status_code=302)

    company_code = request.session.get("company_code")

    # -------------------------------------------------
    # BASE QUERY (STOCK ENTRY)
    # -------------------------------------------------
    q = (
        db.query(Inventory)
        .filter(
            Inventory.cargo_movement_type == "IN",
            Inventory.company_id == company_code
        )
    )

    if production_for:
        q = q.filter(Inventory.production_for == production_for)

    if production_at:
        q = q.filter(Inventory.production_at == production_at)

    if freezer:
        q = q.filter(Inventory.freezer == freezer)

    if from_date and to_date:
        q = q.filter(Inventory.date.between(from_date, to_date))

    q = q.order_by(
        Inventory.production_for,
        Inventory.production_at,
        Inventory.date.desc()
    )

    rows = q.all()

    # -------------------------------------------------
    # REPORT CALCULATION
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

        # -------------------------------------------------
        # 🔍 LOOKUP COST FROM PRODUCTION_FOR MASTER
        # -------------------------------------------------
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

        # -------------------------------------------------
        # ✅ PRODUCTION COST = ONLY GLAZE COST
        # -------------------------------------------------
        production_cost_per_kg = (
            float(costing.production_cost_per_kg) if costing else 0.0
        )

        payable_amount = qty * production_cost_per_kg
        total_payable_sum += payable_amount

        # -------------------------------------------------
        # 🧊 HOLDING COST CALCULATION
        # -------------------------------------------------
        entry_date = r.date
        total_days = (today - entry_date).days

        free_days = int(costing.free_days) if costing else 0
        chargeable_days = max(0, total_days - free_days)

        cost_per_mc_day = float(costing.rate_per_mc_day) if costing else 0.0
        no_of_mc = float(r.no_of_mc or 0)

        holding_cost = chargeable_days * cost_per_mc_day * no_of_mc
        total_holding_sum += holding_cost

        # -------------------------------------------------
        # PUSH ROW
        # -------------------------------------------------
        report_data.append({
            "date": r.date,
            "batch_number": r.batch_number,
            "production_for": r.production_for,
            "production_at": r.production_at,
            "freezer": r.freezer,
            "glaze": r.glaze,
            "variety": r.variety,
            "quantity": round(qty, 2),

            # ✅ PRODUCTION COST (GLAZE ONLY)
            "production_cost_per_kg": round(production_cost_per_kg, 2),
            "payable_amount": round(payable_amount, 2),

            # 🧊 HOLDING COST
            "holding_free_days": free_days,
            "holding_cost_per_mc_day": round(cost_per_mc_day, 2),
            "holding_cost": round(holding_cost, 2)
        })

    # -------------------------------------------------
    # FILTER LOOKUPS
    # -------------------------------------------------
    production_for_list = [
        x[0] for x in
        db.query(Inventory.production_for)
        .filter(Inventory.company_id == company_code)
        .distinct().all()
    ]

    production_at_list = [
        x[0] for x in
        db.query(Inventory.production_at)
        .filter(Inventory.company_id == company_code)
        .distinct().all()
    ]

    freezers = [
        x[0] for x in
        db.query(Inventory.freezer)
        .filter(Inventory.company_id == company_code)
        .distinct().all()
    ]

    # -------------------------------------------------
    # RENDER
    # -------------------------------------------------
    return templates.TemplateResponse(
        "reports/storage_report.html",
        {
            "request": request,
            "report_data": report_data,
            "total_payable_sum": round(total_payable_sum, 2),
            "total_holding_sum": round(total_holding_sum, 2),
            "total_qty_sum": round(total_qty_sum, 2),
            "production_for_list": production_for_list,
            "production_at_list": production_at_list,
            "freezers": freezers,
            "selected_from": from_date,
            "selected_to": to_date
        }
    )
