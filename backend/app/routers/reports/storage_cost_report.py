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
from app.database.models.users import Company
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
    available_stock_items = []
    dispatches_this_month = []
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
            ProductionFor.glaze_percent == item["glaze"],
            ProductionFor.status == "Active",
            ProductionFor.apply_from <= billing_end_date
        ).order_by(ProductionFor.apply_from.desc()).first()

        if not costing:
            costing = db.query(ProductionFor).filter(
                ProductionFor.company_id == company_code,
                ProductionFor.production_for == item["production_for"],
                ProductionFor.freezer_name == item["freezer"],
                ProductionFor.status == "Active",
                ProductionFor.apply_from <= billing_end_date
            ).order_by(ProductionFor.apply_from.desc()).first()

        rate = float(costing.rate_per_mc_day) if costing else 0.0
        free_days = int(costing.free_days) if costing else 0
        p_cost_kg = float(costing.production_cost_per_kg) if costing else 0.0

        # We will reconstruct in_movements and track dispatches
        in_blocks = []
        batch_dispatches = []
        
        combo_rows = db.query(Inventory).filter(
            Inventory.company_id == company_code,
            Inventory.batch_number == item["batch_number"],
            Inventory.freezer == item["freezer"],
            Inventory.glaze == item["glaze"],
            Inventory.grade == item["grade"],
            Inventory.variety == item["variety"],
            Inventory.packing_style == item["packing_style"]
        ).order_by(Inventory.date.asc(), Inventory.id.asc()).all()
        
        for r in combo_rows:
            qty_mc = int(r.no_of_mc or 0)
            qty_kg = float(r.quantity or 0)
            if r.cargo_movement_type == "IN":
                in_blocks.append({
                    "date": r.date,
                    "qty_received": qty_mc,
                    "current_qty": qty_mc,
                    "quantity_kg": qty_kg
                })
            else:
                temp_out = qty_mc
                for inv in in_blocks:
                    if temp_out <= 0: break
                    take = min(inv["current_qty"], temp_out)
                    if take > 0:
                        inv["current_qty"] -= take
                        temp_out -= take
                        if r.date >= billing_start_date and r.date <= billing_end_date:
                            rent_start = inv["date"] + timedelta(days=free_days)
                            calc_start = max(rent_start, billing_start_date)
                            tot_days = (r.date - max(inv["date"], billing_start_date)).days + 1
                            if r.date >= calc_start:
                                pay_days = (r.date - calc_start).days + 1
                                holding_cost_disp = round(pay_days * rate * take, 2)
                            else:
                                pay_days = 0
                                holding_cost_disp = 0.0
                            free_days_tm = tot_days - pay_days
                                
                            batch_dispatches.append({
                                "batch_number": item["batch_number"],
                                "in_date": inv["date"],
                                "out_date": r.date,
                                "variety": item["variety"],
                                "grade": item["grade"],
                                "freezer": item["freezer"],
                                "packing_style": item["packing_style"],
                                "mc_dispatched": take,
                                "qty_kg": round((take / inv["qty_received"]) * inv["quantity_kg"], 2) if inv["qty_received"] > 0 else 0.0,
                                "total_days": tot_days,
                                "free_days_tm": free_days_tm,
                                "payable_days": pay_days,
                                "holding_cost_per_mc_day": rate,
                                "holding_cost": holding_cost_disp
                            })

        batch_holding_cost = 0.0
        for inv in in_blocks:
            if inv["current_qty"] > 0:
                rent_start = inv["date"] + timedelta(days=free_days)
                calc_start = max(rent_start, billing_start_date)
                tot_days = (billing_end_date - max(inv["date"], billing_start_date)).days + 1
                if billing_end_date >= calc_start:
                    pay_days = (billing_end_date - calc_start).days + 1
                    holding_cost_rem = round(pay_days * rate * inv["current_qty"], 2)
                else:
                    pay_days = 0
                    holding_cost_rem = 0.0
                free_days_tm = tot_days - pay_days
                
                batch_holding_cost += holding_cost_rem
                
                available_stock_items.append({
                    "batch_number": item["batch_number"],
                    "in_date": inv["date"],
                    "variety": item["variety"],
                    "grade": item["grade"],
                    "freezer": item["freezer"],
                    "packing_style": item["packing_style"],
                    "available_mc": inv["current_qty"],
                    "qty_kg": round((inv["current_qty"] / inv["qty_received"]) * inv["quantity_kg"], 2) if inv["qty_received"] > 0 else 0.0,
                    "total_days": tot_days,
                    "free_days_tm": free_days_tm,
                    "payable_days": pay_days,
                    "holding_cost_per_mc_day": rate,
                    "holding_cost": holding_cost_rem,
                    "production_cost_per_kg": p_cost_kg,
                    "payable_amount": round(round((inv["current_qty"] / inv["qty_received"]) * inv["quantity_kg"], 2) * p_cost_kg, 2) if (inv["qty_received"] > 0 and inv["date"] >= billing_start_date and inv["date"] <= billing_end_date) else 0.0
                })

        dispatches_this_month.extend(batch_dispatches)
        total_batch_holding = batch_holding_cost + sum(d["holding_cost"] for d in batch_dispatches)
        total_batch_payable = round(item["monthly_in_qty"] * p_cost_kg, 2)

        # Batch-level overall days calculations based on earliest_in_date
        tot_days = (billing_end_date - max(item["earliest_in_date"], billing_start_date)).days + 1
        rent_start = item["earliest_in_date"] + timedelta(days=free_days)
        calc_start = max(rent_start, billing_start_date)
        if billing_end_date >= calc_start:
            pay_days = (billing_end_date - calc_start).days + 1
        else:
            pay_days = 0
        free_days_tm = tot_days - pay_days

        item.update({
            "holding_cost_per_mc_day": rate,
            "holding_cost": round(total_batch_holding, 2),
            "free_days": free_days,
            "total_days": tot_days,
            "free_days_tm": free_days_tm,
            "payable_days": pay_days,
            "production_cost_per_kg": p_cost_kg,
            "payable_amount": total_batch_payable
        })
        
        total_qty_sum += item["monthly_in_qty"]
        total_holding_sum += total_batch_holding
        total_payable_sum += total_batch_payable
        
        report_data.append(item)

    # Dropdowns
    p_for_list = [x[0] for x in db.query(Inventory.production_for).filter(Inventory.company_id == company_code).distinct().all()]
    p_at_list = [x[0] for x in db.query(Inventory.production_at).filter(Inventory.company_id == company_code).distinct().all()]
    fzrs = [x[0] for x in db.query(Inventory.freezer).filter(Inventory.company_id == company_code).distinct().all()]

    c_info = db.query(Company).filter(Company.company_code == company_code).first()
    company_name = c_info.company_name if c_info else "BKNR ERP"

    if request.query_params.get("format") == "json":
        from fastapi.responses import JSONResponse
        from fastapi.encoders import jsonable_encoder
        serialized_report_data = []
        for item in report_data:
            ser_item = dict(item)
            if "details" in ser_item:
                r = ser_item["details"]
                ser_item["details"] = {col.name: getattr(r, col.name) for col in r.__table__.columns}
            serialized_report_data.append(ser_item)
            
        json_context = {
            "report_data": serialized_report_data,
            "available_stock_items": available_stock_items,
            "dispatches_this_month": dispatches_this_month,
            "production_for_list": p_for_list,
            "production_at_list": p_at_list,
            "freezers": fzrs,
            "selected_month": selected_month,
            "selected_production_for": effective_production_for,
            "selected_location": effective_location,
            "billing_start_date": billing_start_date.isoformat() if billing_start_date else None,
            "total_qty_sum": round(total_qty_sum, 2),
            "total_holding_sum": round(total_holding_sum, 2),
            "total_payable_sum": round(total_payable_sum, 2),
            "company_name": company_name
        }
        return JSONResponse(jsonable_encoder(json_context))

    return templates.TemplateResponse(
        request=request, 
        name="reports/storage_report.html",
        context={
            "report_data": report_data,
            "available_stock_items": available_stock_items,
            "dispatches_this_month": dispatches_this_month,
            "production_for_list": p_for_list,
            "production_at_list": p_at_list,
            "freezers": fzrs,
            "selected_month": selected_month,
            "selected_production_for": effective_production_for, # 🟢 Passed to layout templates context
            "selected_location": effective_location,             # 🟢 Passed to layout templates context
            "billing_start_date": billing_start_date,
            "total_qty_sum": round(total_qty_sum, 2),
            "total_holding_sum": round(total_holding_sum, 2),
            "total_payable_sum": round(total_payable_sum, 2),
            "company_name": company_name
        }
    )