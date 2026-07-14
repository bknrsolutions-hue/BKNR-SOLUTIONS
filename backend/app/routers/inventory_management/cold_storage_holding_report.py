# ============================================================================
# COLD STORAGE HOLDING REPORT ROUTER (BKNR ERP - FULLY UPDATED WITH FILTERS)
# ============================================================================

from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date
from app.utils.timezone import ist_now
from datetime import timedelta
from io import BytesIO
from openpyxl import Workbook
import math
from app.utils.global_filters import get_global_filters

from app.database import get_db
from app.database.models.inventory_management import cold_storage_holding
from app.database.models.reprocess import Reprocess
from app.database.models.users import Company
from app.database.models.criteria import (
    packing_styles, varieties, grades, brands, species as species_model
)

router = APIRouter(prefix="/cold_storage_holding_report", tags=["COLD STORAGE HOLDING REPORT"])

templates = Jinja2Templates(directory="app/templates")

# ------------------------------------------------------------
# HELPER: HOLDING COST CALCULATION
# ------------------------------------------------------------
def calculate_batch_holding_cost(db: Session, batch_no: str, comp_code: str, target_row_id: int):
    today = date.today()
    in_row = db.query(cold_storage_holding).filter(cold_storage_holding.id == target_row_id).first()
    
    if not in_row or str(in_row.cargo_movement_type).upper() != 'IN':
        return 0.0

    movements = db.query(cold_storage_holding).filter(
        cold_storage_holding.batch_number == batch_no,
        cold_storage_holding.company_id == comp_code
    ).order_by(cold_storage_holding.in_date.asc(), cold_storage_holding.id.asc()).all()

    rent_start = in_row.rent_start_date or in_row.in_date
    rtype = str(in_row.rent_type or 'DAILY').upper()
    rate = float(in_row.storage_rate_per_mc or 0)
    
    initial_in_mc = float(in_row.no_of_mc or 0)
    total_cost = 0.0

    if rtype == "DAILY":
        curr_date = rent_start
        while curr_date <= today:
            batch_net_balance = 0.0
            for m in movements:
                if m.in_date <= curr_date:
                    m_mc = float(m.no_of_mc or 0)
                    if str(m.cargo_movement_type).upper() == 'IN':
                        batch_net_balance += m_mc
                    else:
                        batch_net_balance -= m_mc
            
            actual_chargeable_mc = min(initial_in_mc, max(batch_net_balance, 0))
            total_cost += (actual_chargeable_mc * rate)
            curr_date += timedelta(days=1)

    elif rtype == "MONTHLY":
        batch_net_balance = sum([(float(m.no_of_mc or 0) if str(m.cargo_movement_type).upper() == 'IN' else -float(m.no_of_mc or 0)) for m in movements])
        actual_chargeable_mc = min(initial_in_mc, max(batch_net_balance, 0))
        
        if actual_chargeable_mc > 0:
            days_diff = (today - rent_start).days + 1
            months = math.ceil(days_diff / 30)
            total_cost = months * actual_chargeable_mc * rate
        else:
            total_cost = 0.0

    return round(total_cost, 2)

# ------------------------------------------------------------
# 1. MAIN REPORT PAGE (GET) - WITH UNIVERSAL FILTERS LAYER
# ------------------------------------------------------------
@router.get("", response_class=HTMLResponse)
@router.get("/", response_class=HTMLResponse)
async def cold_storage_report_page(
    request: Request,
    db: Session = Depends(get_db),
    from_date: str = "",
    to_date: str = "",
    format: str = ""
):
    # 🟢 FETCH ACTIVE UNIVERSAL FILTERS FROM CONTEXT LAYER
    production_for, location = get_global_filters(request)
    
    comp_code = request.session.get("company_code")
    role = request.session.get("role")
    if not comp_code: return RedirectResponse("/auth/login", status_code=302)

    # Base Query Construction
    q = db.query(cold_storage_holding).filter(cold_storage_holding.company_id == comp_code)
    
    # 🟢 INJECT ACTIVE UNIVERSAL FILTERS
    if production_for:
        q = q.filter(func.trim(cold_storage_holding.production_for) == func.trim(production_for))
    if location:
        q = q.filter(func.trim(cold_storage_holding.production_at) == func.trim(location)) # 👈 Production At matching

    if from_date: q = q.filter(cold_storage_holding.in_date >= date.fromisoformat(from_date))
    if to_date: q = q.filter(cold_storage_holding.in_date <= date.fromisoformat(to_date))

    rows = q.order_by(cold_storage_holding.cold_storage_name.asc(), cold_storage_holding.in_date.asc()).all()

    for r in rows:
        # --- REPROCESS LOOKUP (Enhanced Matching) ---
        reprocess_item = db.query(Reprocess).filter(
            Reprocess.company_id == comp_code,
            func.trim(Reprocess.new_batch_id) == func.trim(r.batch_number),
            func.trim(Reprocess.variety) == func.trim(r.variety or ""),
            func.trim(Reprocess.grade) == func.trim(r.grade or ""),
            func.trim(Reprocess.packing_style) == func.trim(r.packing_style or ""),
            func.trim(Reprocess.glaze) == func.trim(r.glaze or ""),
            func.trim(Reprocess.freezer) == func.trim(r.freezer or "")
        ).first()

        if not reprocess_item:
            reprocess_item = db.query(Reprocess).filter(
                Reprocess.company_id == comp_code,
                func.trim(Reprocess.new_batch_id) == func.trim(r.batch_number)
            ).first()

        kg_rate = float(reprocess_item.product_kg_value or 0) if reprocess_item else 0.0
        r.product_kg_value = kg_rate

        # --- CALCULATIONS ---
        qty = float(r.quantity or 0)
        m_type = str(r.cargo_movement_type or "").upper()
        
        r.inventory_value = round(qty * kg_rate, 2) if m_type == 'IN' else -round(abs(qty) * kg_rate, 2)
        
        if m_type == 'IN' and r.status == "HOLDING":
            r.holding_cost = calculate_batch_holding_cost(db, r.batch_number, comp_code, r.id)
        else:
            r.holding_cost = 0.0

        h_rate = float(r.handling_rate or 0)
        lu_rate = float(r.loading_unloading_cost or 0)
        mc_units = abs(float(r.no_of_mc or 0)) + (1.0 if float(r.loose or 0) > 0 else 0.0)

        if m_type == 'IN':
            r.other_charges = round((lu_rate + h_rate) * mc_units, 2)
        else:
            r.other_charges = round(lu_rate * mc_units, 2)

        r.total_payable = round(r.holding_cost + r.other_charges, 2)

    def get_list(model, attr):
        return [getattr(x, attr) for x in db.query(model).filter(model.company_id == comp_code).all()]

    c_info = db.query(Company).filter(Company.company_code == comp_code).first()
    
    is_json = format == "json" or request.query_params.get("format") == "json"

    if is_json:
        from fastapi.responses import JSONResponse
        import datetime as dt_mod
        def row_to_dict_cs(r):
            result = {}
            for col in r.__table__.columns:
                val = getattr(r, col.name)
                if isinstance(val, (dt_mod.datetime, dt_mod.date)):
                    val = val.isoformat()
                elif isinstance(val, dt_mod.time):
                    val = val.strftime("%H:%M")
                result[col.name] = val
            # computed fields
            result["product_kg_value"] = getattr(r, "product_kg_value", 0.0)
            result["inventory_value"] = getattr(r, "inventory_value", 0.0)
            result["holding_cost"] = getattr(r, "holding_cost", 0.0)
            result["other_charges"] = getattr(r, "other_charges", 0.0)
            result["total_payable"] = getattr(r, "total_payable", 0.0)
            return result
        # Build combo_rows (batch-level aggregated summary for the React summary tab)
        from collections import defaultdict
        combo_map = defaultdict(lambda: {
            "batch_number": "", "cold_storage_name": "", "species": "",
            "variety": "", "grade": "", "glaze": "", "freezer": "", "production_for": "",
            "in_mc": 0.0, "out_mc": 0.0, "balance_mc": 0.0,
            "in_qty": 0.0, "out_qty": 0.0, "balance_qty": 0.0,
            "inv_value_balance": 0.0, "holding_cost": 0.0,
            "other_charges": 0.0, "total_payable": 0.0,
            "status": "HOLDING", "payment_status": "",
        })
        for r in rows:
            key = (
                getattr(r, "batch_number", ""),
                getattr(r, "cold_storage_name", ""),
                getattr(r, "species", ""),
                getattr(r, "variety", ""),
                getattr(r, "grade", ""),
                getattr(r, "glaze", ""),
                getattr(r, "freezer", ""),
            )
            entry = combo_map[key]
            entry["batch_number"] = getattr(r, "batch_number", "")
            entry["cold_storage_name"] = getattr(r, "cold_storage_name", "")
            entry["species"] = getattr(r, "species", "")
            entry["variety"] = getattr(r, "variety", "")
            entry["grade"] = getattr(r, "grade", "")
            entry["glaze"] = getattr(r, "glaze", "")
            entry["freezer"] = getattr(r, "freezer", "")
            entry["production_for"] = getattr(r, "production_for", "")
            mc = float(getattr(r, "no_of_mc", 0) or 0)
            qty = float(getattr(r, "quantity", 0) or 0)
            mv_type = str(getattr(r, "cargo_movement_type", "IN") or "IN").upper()
            if mv_type == "IN":
                entry["in_mc"] = round(entry["in_mc"] + mc, 2)
                entry["in_qty"] = round(entry["in_qty"] + qty, 2)
                entry["inv_value_balance"] = round(entry["inv_value_balance"] + getattr(r, "inventory_value", 0.0), 2)
            else:
                entry["out_mc"] = round(entry["out_mc"] + mc, 2)
                entry["out_qty"] = round(entry["out_qty"] + qty, 2)
            entry["holding_cost"] = round(entry["holding_cost"] + getattr(r, "holding_cost", 0.0), 2)
            entry["other_charges"] = round(entry["other_charges"] + getattr(r, "other_charges", 0.0), 2)
            entry["total_payable"] = round(entry["total_payable"] + getattr(r, "total_payable", 0.0), 2)
            entry["status"] = getattr(r, "status", "HOLDING") or "HOLDING"
            entry["payment_status"] = getattr(r, "payment_status", "") or ""

        for entry in combo_map.values():
            entry["balance_mc"] = round(entry["in_mc"] - entry["out_mc"], 2)
            entry["balance_qty"] = round(entry["in_qty"] - entry["out_qty"], 2)

        combo_rows = list(combo_map.values())

        return JSONResponse({
            "rows": [row_to_dict_cs(r) for r in rows],
            "combo_rows": combo_rows,
            "from_date": from_date,
            "to_date": to_date,
            "selected_production_for": production_for,
            "selected_location": location,
        })


    context = {
        "request": request, 
        "rows": rows, 
        "from_date": from_date, 
        "to_date": to_date,
        "selected_production_for": production_for,
        "selected_location": location,
        "species_list": get_list(species_model, "species_name"),
        "brands_list": get_list(brands, "brand_name"),
        "varieties_list": get_list(varieties, "variety_name"),
        "grades_list": get_list(grades, "grade_name"),
        "packing_styles_list": get_list(packing_styles, "packing_style"),
        "company_name": c_info.company_name if c_info else "BKNR ERP",
        "role": role
    }
    
    return templates.TemplateResponse(
        request=request, 
        name="inventory_management/cold_storage_report.html", 
        context=context
    )

# ------------------------------------------------------------
# 2. API: UPDATE RECORD - TRANSACTIONAL
# ------------------------------------------------------------
@router.post("/update")
async def update_cold_storage(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: raise HTTPException(status_code=401)

    row = db.query(cold_storage_holding).filter(
        cold_storage_holding.id == payload.get("id"), 
        cold_storage_holding.company_id == comp_code
    ).first()
    
    if not row: raise HTTPException(status_code=404)

    editable = [
        "cold_storage_name", "batch_number", "species", "variety", "grade", 
        "brand", "packing_style", "no_of_mc", "loose", "status", "remarks",
        "freezer", "glaze", "po_number", "purpose", "production_for"
    ]
    
    for f in editable:
        if f in payload: setattr(row, f, payload[f])

    pack = db.query(packing_styles).filter(
        packing_styles.company_id == comp_code, 
        packing_styles.packing_style == row.packing_style
    ).first()
    
    if pack:
        row.quantity = (float(row.no_of_mc or 0) * float(pack.mc_weight or 0)) + \
                       (float(row.loose or 0) * float(pack.slab_weight or 0))
    
    db.commit()
    return {"status": "success"}

# ------------------------------------------------------------
# 3. API: DELETE ENTRY - TRANSACTIONAL
# ------------------------------------------------------------
@router.post("/delete")
async def delete_entry(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    row = db.query(cold_storage_holding).filter(
        cold_storage_holding.id == payload.get("id"), 
        cold_storage_holding.company_id == comp_code
    ).first()
    
    if row:
        db.delete(row)
        db.commit()
        return {"status": "success"}
    raise HTTPException(status_code=404)

# ------------------------------------------------------------
# 4. EXCEL EXPORT - WITH UNIVERSAL FILTERS LAYER
# ------------------------------------------------------------
@router.get("/export_xlsx")
def export_xlsx(request: Request, db: Session = Depends(get_db), from_date: str = "", to_date: str = ""):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/auth/login")

    # 🟢 FIX: Extract filters with custom prefix to bypass any explicit argument name clash
    global_production_for, global_location = get_global_filters(request)

    q = db.query(cold_storage_holding).filter(cold_storage_holding.company_id == comp_code)
    
    # 🟢 Layer universal bindings safely onto workbook parameter constraints pipeline
    if global_production_for:
        q = q.filter(func.trim(cold_storage_holding.production_for) == func.trim(global_production_for))
    if global_location:
        q = q.filter(func.trim(cold_storage_holding.production_at) == func.trim(global_location))

    if from_date: q = q.filter(cold_storage_holding.in_date >= date.fromisoformat(from_date))
    if to_date: q = q.filter(cold_storage_holding.in_date <= date.fromisoformat(to_date))
    
    rows = q.order_by(cold_storage_holding.in_date.asc()).all()
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Cold Storage Inventory"
    
    ws.append([
        "Date", "Storage Name", "Batch #", "Type", "Species", "Variety", 
        "Grade", "MC", "Lse", "Qty(KG)", "Inventory Val", "Holding Cost", "Other Chg", "Total Payable"
    ])
    
    for r in rows:
        reprocess_item = db.query(Reprocess).filter(
            Reprocess.company_id == comp_code,
            func.trim(Reprocess.new_batch_id) == func.trim(r.batch_number),
            func.trim(Reprocess.variety) == func.trim(r.variety or ""),
            func.trim(Reprocess.grade) == func.trim(r.grade or "")
        ).first()

        if not reprocess_item:
            reprocess_item = db.query(Reprocess).filter(
                Reprocess.company_id == comp_code,
                func.trim(Reprocess.new_batch_id) == func.trim(r.batch_number)
            ).first()
        
        kg_rate = float(reprocess_item.product_kg_value or 0) if reprocess_item else 0.0
        m_type = str(r.cargo_movement_type or "").upper()
        
        h_cost = calculate_batch_holding_cost(db, r.batch_number, comp_code, r.id) if m_type == 'IN' else 0.0
        
        h_rate = float(r.handling_rate or 0)
        lu_rate = float(r.loading_unloading_cost or 0)
        mc_units = abs(float(r.no_of_mc or 0)) + (1.0 if float(r.loose or 0) > 0 else 0.0)
        o_chg = round((h_rate + lu_rate) * mc_units, 2) if m_type == 'IN' else round(lu_rate * mc_units, 2)
        
        ws.append([
            str(r.in_date), r.cold_storage_name, r.batch_number, m_type, r.species, r.variety,
            r.grade, r.no_of_mc, r.loose, r.quantity, 
            round(r.quantity * kg_rate, 2) if m_type == 'IN' else -round(abs(r.quantity) * kg_rate, 2),
            h_cost, o_chg, round(h_cost + o_chg, 2)
        ])

    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    
    return StreamingResponse(
        stream, 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
        headers={"Content-Disposition": f"attachment; filename=CS_Inventory_{date.today()}.xlsx"}
    )