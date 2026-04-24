from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta  # ఇక్కడ timedelta యాడ్ చేశాను
import calendar

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
    selected_month: str = "",
    db: Session = Depends(get_db)
):
    # 🔐 SESSION CHECK
    if not request.session.get("email"):
        return RedirectResponse("/", status_code=302)

    company_code = request.session.get("company_code")
    today = date.today()

    # 📅 MONTHLY BILLING BOUNDARIES
    billing_end_date = today
    billing_start_date = None

    if selected_month:
        try:
            yr, mn = map(int, selected_month.split("-"))
            billing_start_date = date(yr, mn, 1)
            last_day = calendar.monthrange(yr, mn)[1]
            billing_end_date = date(yr, mn, last_day)
        except:
            billing_start_date = None
            billing_end_date = today

    # BASE QUERY
    q = db.query(Inventory).filter(Inventory.company_id == company_code)
    if production_for: q = q.filter(Inventory.production_for == production_for)
    if production_at: q = q.filter(Inventory.production_at == production_at)
    if freezer: q = q.filter(Inventory.freezer == freezer)
    
    q = q.filter(Inventory.date <= billing_end_date)
    rows = q.order_by(Inventory.batch_number, Inventory.date.asc()).all()

    # 📂 GROUPING LOGIC
    grouped_dict = {}
    for r in rows:
        combo_key = (r.batch_number, r.freezer, r.glaze, r.grade, r.variety, r.packing_style)
        if combo_key not in grouped_dict:
            grouped_dict[combo_key] = {
                "batch_number": r.batch_number, "freezer": r.freezer, "glaze": r.glaze,
                "grade": r.grade, "variety": r.variety, "packing_style": r.packing_style,
                "production_for": r.production_for, "production_at": r.production_at,
                "in_date": r.date, "movements": [],
                "total_in_mc": 0.0, "total_out_mc": 0.0, "total_qty": 0.0
            }
        data = grouped_dict[combo_key]
        if r.cargo_movement_type == "IN":
            data["total_in_mc"] += float(r.no_of_mc or 0)
            data["total_qty"] += float(r.quantity or 0)
            if r.date < data["in_date"]: data["in_date"] = r.date
        else:
            data["total_out_mc"] += float(r.no_of_mc or 0)
        data["movements"].append(r)

    # 💰 CALCULATION LOGIC (Specific Month Only)
    report_data = []
    total_payable_sum, total_holding_sum, total_qty_sum = 0.0, 0.0, 0.0

    for key, item in grouped_dict.items():
        costing = db.query(ProductionFor).filter(
            ProductionFor.company_id == company_code,
            ProductionFor.production_for == item["production_for"],
            ProductionFor.freezer_name == item["freezer"],
            ProductionFor.glaze_percent == item["glaze"],
            ProductionFor.apply_from <= item["in_date"]
        ).order_by(ProductionFor.apply_from.desc()).first()

        rate = float(costing.rate_per_mc_day) if costing else 0.0
        free_days = int(costing.free_days) if costing and costing.free_days else 0
        prod_cost_kg = float(costing.production_cost_per_kg) if costing else 0.0
        
        item.update({
            "production_cost_per_kg": prod_cost_kg,
            "holding_cost_per_mc_day": rate,
            "holding_free_days": free_days,
            "payable_amount": item["total_qty"] * prod_cost_kg
        })
        
        total_payable_sum += item["payable_amount"]
        total_qty_sum += item["total_qty"]

        # --- మంత్లీ కాలిక్యులేషన్ లాజిక్ ---
        current_holding = 0.0
        total_p_days = 0
        
        # స్టాక్ ఎప్పుడు ఫ్రీ డేస్ దాటి బిల్లింగ్ కి వస్తుందో ఆ డేట్
        billable_after_date = item["in_date"] + timedelta(days=free_days)

        # ఈ నెలలో మనం లెక్కించాల్సిన స్టార్ట్ డేట్ (Billing Start లేదా Billable Start.. ఏది లేట్ అయితే అది)
        if billing_start_date:
            effective_start = max(billable_after_date, billing_start_date)
        else:
            effective_start = billable_after_date

        # 1. OUT అయిన వాటికి ఈ నెల లెక్క
        for m in item["movements"]:
            if m.cargo_movement_type == "OUT":
                if billing_start_date and m.date < billing_start_date: continue
                
                calc_until = min(m.date, billing_end_date)
                days_in_month = (calc_until - effective_start).days
                if days_in_month > 0:
                    total_p_days += days_in_month
                    current_holding += days_in_month * rate * float(m.no_of_mc or 0)

        # 2. బ్యాలెన్స్ స్టాక్ కి ఈ నెల లెక్క
        balance_mc = item["total_in_mc"] - item["total_out_mc"]
        item["balance_mc"] = balance_mc
        if balance_mc > 0:
            days_in_month = (billing_end_date - effective_start).days
            if days_in_month > 0:
                total_p_days += days_in_month
                current_holding += days_in_month * rate * balance_mc

        item["payable_days"] = total_p_days
        item["holding_cost"] = round(current_holding, 2)
        total_holding_sum += current_holding
        report_data.append(item)

    # Filter Lists
    p_for = [x[0] for x in db.query(Inventory.production_for).filter(Inventory.company_id == company_code).distinct().all()]
    p_at = [x[0] for x in db.query(Inventory.production_at).filter(Inventory.company_id == company_code).distinct().all()]
    fzrs = [x[0] for x in db.query(Inventory.freezer).filter(Inventory.company_id == company_code).distinct().all()]

    return templates.TemplateResponse(
        request=request, name="reports/storage_report.html",
        context={
            "report_data": report_data,
            "total_payable_sum": round(total_payable_sum, 2),
            "total_holding_sum": round(total_holding_sum, 2),
            "total_qty_sum": round(total_qty_sum, 2),
            "production_for_list": p_for, "production_at_list": p_at, "freezers": fzrs,
            "selected_month": selected_month, "billing_end_date": billing_end_date
        }
    )