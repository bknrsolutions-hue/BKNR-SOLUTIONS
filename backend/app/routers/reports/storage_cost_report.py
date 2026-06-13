from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta
from app.utils.timezone import ist_now
import calendar

from app.database import get_db
from app.database.models.inventory_management import stock_entry as Inventory
from app.database.models.criteria import production_for as ProductionFor
from app.utils.global_filters import get_global_filters

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
    # 🟢 FIX 1: Safe extraction to avoid parameter collision overwriting local variables
    global_production_for, global_location = get_global_filters(request)
    
    # 🔐 SESSION CHECK
    if not request.session.get("email"):
        return RedirectResponse("/", status_code=302)

    company_code = request.session.get("company_code")
    today = date.today()

    # 📅 MONTHLY BOUNDARIES
    if selected_month:
        try:
            yr, mn = map(int, selected_month.split("-"))
            billing_start_date = date(yr, mn, 1)
            billing_end_date = date(yr, mn, calendar.monthrange(yr, mn)[1])
        except:
            billing_start_date = date(today.year, today.month, 1)
            billing_end_date = today
    else:
        billing_start_date = date(today.year, today.month, 1)
        billing_end_date = today

    # 🔍 FETCH ALL DATA (FIFO కోసం Billing End Date వరకు ఉన్నవన్నీ కావాలి)
    q = db.query(Inventory).filter(Inventory.company_id == company_code)
    
    # 🟢 FIX 2: Manual screen selection OR Global header selection fallback mechanism
    effective_production_for = global_production_for or production_for
    effective_location = global_location or production_at

    if effective_production_for: 
        q = q.filter(Inventory.production_for == effective_production_for)
    if effective_location: 
        q = q.filter(Inventory.production_at == effective_location)
    if freezer: 
        q = q.filter(Inventory.freezer == freezer)
    
    all_rows = q.filter(Inventory.date <= billing_end_date).order_by(Inventory.date.asc()).all()

    # 📂 COMBO-WISE GROUPING
    grouped_dict = {}

    for r in all_rows:
        combo_key = (r.batch_number, r.freezer, r.glaze, r.grade, r.variety, r.packing_style)
        
        if combo_key not in grouped_dict:
            grouped_dict[combo_key] = {
                "details": r,  
                "batch_number": r.batch_number,
                "freezer": r.freezer,
                "glaze": r.glaze,
                "grade": r.grade,
                "variety": r.variety,
                "packing_style": r.packing_style,
                "species": r.species,
                "brand": r.brand,
                "production_for": r.production_for,
                "production_at": r.production_at,
                "opening_mc": 0.0,
                "monthly_in_mc": 0.0,
                "monthly_out_mc": 0.0,
                "monthly_in_qty": 0.0,
                "in_movements": [], 
                "this_month_ledger": [], 
                "earliest_in_date": r.date
            }
        
        data = grouped_dict[combo_key]
        qty_mc = int(r.no_of_mc or 0)
        qty_kg = float(r.quantity or 0)

        if r.cargo_movement_type == "IN":
            data["in_movements"].append({"date": r.date, "qty": qty_mc, "rem": qty_mc})
            
            if r.date < billing_start_date:
                data["opening_mc"] += qty_mc
            else:
                data["monthly_in_mc"] += qty_mc
                data["monthly_in_qty"] += qty_kg
                data["this_month_ledger"].append(r)
        else:
            temp_out = qty_mc
            for inv in data["in_movements"]:
                if temp_out <= 0: break
                take = min(inv["rem"], temp_out)
                inv["rem"] -= take
                temp_out -= take

            if r.date < billing_start_date:
                data["opening_mc"] -= qty_mc
            else:
                data["monthly_out_mc"] += qty_mc
                data["this_month_ledger"].append(r)

    # 💰 FINAL CALCULATIONS
    report_data = []
    total_qty_sum = 0.0
    total_holding_sum = 0.0
    total_payable_sum = 0.0
    
    for key, item in grouped_dict.items():
        item["closing_mc"] = item["opening_mc"] + item["monthly_in_mc"] - item["monthly_out_mc"]
        
        if item["opening_mc"] == 0 and item["monthly_in_mc"] == 0 and item["monthly_out_mc"] == 0:
            continue

        costing = db.query(ProductionFor).filter(
            ProductionFor.company_id == company_code,
            ProductionFor.production_for == item["production_for"],
            ProductionFor.freezer_name == item["freezer"],
            ProductionFor.apply_from <= item["earliest_in_date"]
        ).order_by(ProductionFor.apply_from.desc()).first()

        rate = float(costing.rate_per_mc_day) if costing else 0.0
        free_days = int(costing.free_days) if costing else 0
        p_cost_kg = float(costing.production_cost_per_kg) if costing else 0.0

        holding_cost = 0.0
        for inv in item["in_movements"]:
            if inv["rem"] > 0:
                billable_start = inv["date"] + timedelta(days=free_days)
                calc_start = max(billable_start, billing_start_date)
                if billing_end_date >= calc_start:
                    days = (billing_end_date - calc_start).days + 1
                    holding_cost += days * rate * inv["rem"]

        item.update({
            "holding_cost_per_mc_day": rate,
            "holding_cost": round(holding_cost, 2),
            "payable_amount": round(item["monthly_in_qty"] * p_cost_kg, 2)
        })
        
        total_qty_sum += item["monthly_in_qty"]
        total_holding_sum += item["holding_cost"]
        total_payable_sum += item["payable_amount"]
        
        report_data.append(item)

    # Dropdowns
    p_for_list = [x[0] for x in db.query(Inventory.production_for).filter(Inventory.company_id == company_code).distinct().all()]
    p_at_list = [x[0] for x in db.query(Inventory.production_at).filter(Inventory.company_id == company_code).distinct().all()]
    fzrs = [x[0] for x in db.query(Inventory.freezer).filter(Inventory.company_id == company_code).distinct().all()]

    return templates.TemplateResponse(
        request=request, 
        name="reports/storage_report.html",
        context={
            "report_data": report_data,
            "production_for_list": p_for_list,
            "production_at_list": p_at_list,
            "freezers": fzrs,
            "selected_month": selected_month,
            "selected_production_for": effective_production_for, # 🟢 Passed to layout templates context
            "selected_location": effective_location,             # 🟢 Passed to layout templates context
            "billing_start_date": billing_start_date,
            "total_qty_sum": round(total_qty_sum, 2),
            "total_holding_sum": round(total_holding_sum, 2),
            "total_payable_sum": round(total_payable_sum, 2)
        }
    )