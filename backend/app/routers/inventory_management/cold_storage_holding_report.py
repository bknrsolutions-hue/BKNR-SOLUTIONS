from fastapi import APIRouter, Request, Depends, Body, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date, timedelta
import pytz
from io import BytesIO
from openpyxl import Workbook
import math

from app.database import get_db
from app.database.models.inventory_management import cold_storage_holding
from app.database.models.users import Company
from app.database.models.criteria import (
    packing_styles, varieties, grades, brands, species as species_model
)

router = APIRouter(prefix="/cold_storage_holding_report", tags=["COLD STORAGE HOLDING REPORT"])

# ------------------------------------------------------------
# HELPER: HOLDING COST CALCULATION (FIXED FOR SAME DAY & PARTIAL)
# ------------------------------------------------------------
def calculate_batch_holding_cost(db: Session, batch_no: str, comp_code: str, target_row_id: int):
    today = date.today()
    
    # Target row info
    in_row = db.query(cold_storage_holding).filter(cold_storage_holding.id == target_row_id).first()
    
    # Rent kevalam 'IN' rows ki mathrame calculate chestham
    if not in_row or str(in_row.cargo_movement_type).upper() != 'IN':
        return 0.0

    # Batch movements anni thechukovali (IN lu, OUT lu anni)
    movements = db.query(cold_storage_holding).filter(
        cold_storage_holding.batch_number == batch_no,
        cold_storage_holding.company_id == comp_code
    ).order_by(cold_storage_holding.in_date.asc(), cold_storage_holding.id.asc()).all()

    rent_start = in_row.rent_start_date or in_row.in_date
    rtype = str(in_row.rent_type or 'DAILY').upper()
    rate = float(in_row.storage_rate_per_mc or 0)
    
    # Step 1: Ee specific 'IN' row lo enni MCs unnay?
    initial_in_mc = float(in_row.no_of_mc or 0)
    
    # Step 2: Ee row kante mundu vachina entries valla balance entha undo chudali (FIFO Logic)
    # Ante ee specific row nundi quantity eppudu taggalo decide chestham
    total_cost = 0.0

    if rtype == "DAILY":
        curr_date = rent_start
        while curr_date <= today:
            # Aa date ki batch motham balance calculation
            batch_net_balance = 0.0
            for m in movements:
                if m.in_date <= curr_date:
                    m_mc = float(m.no_of_mc or 0)
                    if str(m.cargo_movement_type).upper() == 'IN':
                        batch_net_balance += m_mc
                    else:
                        batch_net_balance -= m_mc
            
            # Important: Row level control
            # Ee specific row contribution batch balance lo entha undo chudali
            # Ante, batch motham balance 200 unte, mee row initial 400 ayina, rent 200 ke padali.
            # Kaani batch balance 600 unna, mee row capacity 400 kabatti, 400 ke padali.
            actual_chargeable_mc = min(initial_in_mc, max(batch_net_balance, 0))
            
            total_cost += (actual_chargeable_mc * rate)
            curr_date += timedelta(days=1)

    elif rtype == "MONTHLY":
        # Monthly logic: 1 roju unna 30 days rent padali
        # Batch balance calculate chesi, actual ga stock unna months calculate chestham
        batch_net_balance = sum([(float(m.no_of_mc or 0) if str(m.cargo_movement_type).upper() == 'IN' else -float(m.no_of_mc or 0)) for m in movements])
        
        actual_chargeable_mc = min(initial_in_mc, max(batch_net_balance, 0))
        
        if actual_chargeable_mc > 0:
            days_diff = (today - rent_start).days + 1 # +1 for same day inclusive
            months = math.ceil(days_diff / 30)
            total_cost = months * actual_chargeable_mc * rate
        else:
            total_cost = 0.0

    return round(total_cost, 2)
# ------------------------------------------------------------
# 1. MAIN REPORT PAGE
# ------------------------------------------------------------
@router.get("/", response_class=HTMLResponse)
async def cold_storage_report_page(
    request: Request,
    db: Session = Depends(get_db),
    from_date: str = "",
    to_date: str = ""
):
    comp_code = request.session.get("company_code")
    role = request.session.get("role")
    if not comp_code: return RedirectResponse("/auth/login", status_code=302)

    # Display query
    q = db.query(cold_storage_holding).filter(cold_storage_holding.company_id == comp_code)
    if from_date: q = q.filter(cold_storage_holding.in_date >= date.fromisoformat(from_date))
    if to_date: q = q.filter(cold_storage_holding.in_date <= date.fromisoformat(to_date))

    rows = q.order_by(cold_storage_holding.cold_storage_name.asc(), cold_storage_holding.in_date.asc()).all()

    for r in rows:
        # Data prep
        h_rate = float(r.handling_rate or 0)
        lu_rate = float(r.loading_unloading_cost or 0)
        kg_rate = float(r.product_kg_value or 0)
        qty = float(r.quantity or 0)
        mc_units = abs(float(r.no_of_mc or 0)) + (1.0 if float(r.loose or 0) > 0 else 0.0)
        m_type = str(r.cargo_movement_type or "").upper()

        # 1. Inventory Value (Fixed typo: kg_rate)
        r.inventory_value = round(qty * kg_rate, 2) if m_type == 'IN' else -round(abs(qty) * kg_rate, 2)
        
        # 2. Holding Cost Logic (Partial Out handles here)
        if m_type == 'IN' and r.status == "HOLDING":
            r.holding_cost = calculate_batch_holding_cost(db, r.batch_number, comp_code, r.id)
        else:
            r.holding_cost = 0.0

        # 3. Other Charges
        if m_type == 'IN':
            r.other_charges = round((lu_rate + h_rate) * mc_units, 2)
        else:
            r.other_charges = round(lu_rate * mc_units, 2)

        r.total_payable = round(r.holding_cost + r.other_charges, 2)

    # Helpers for dropdowns
    def get_list(model, attr):
        return [getattr(x, attr) for x in db.query(model).filter(model.company_id == comp_code).all()]

    c_info = db.query(Company).filter(Company.company_code == comp_code).first()
    
    context = {
        "request": request, "rows": rows, "from_date": from_date, "to_date": to_date,
        "species_list": get_list(species_model, "species_name"),
        "brands_list": get_list(brands, "brand_name"),
        "varieties_list": get_list(varieties, "variety_name"),
        "grades_list": get_list(grades, "grade_name"),
        "packing_styles_list": get_list(packing_styles, "packing_style"),
        "company_name": c_info.company_name if c_info else "BKNR ERP",
        "role": role
    }
    return request.app.state.templates.TemplateResponse("inventory_management/cold_storage_report.html", context)

# ------------------------------------------------------------
# 2. UPDATE RECORD
# ------------------------------------------------------------
@router.post("/update")
async def update_cold_storage(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if request.session.get("role") != "admin": raise HTTPException(status_code=403)

    row = db.query(cold_storage_holding).filter(cold_storage_holding.id == payload.get("id"), cold_storage_holding.company_id == comp_code).first()
    if not row: raise HTTPException(status_code=404)

    editable = ["cold_storage_name", "species", "variety", "grade", "brand", "packing_style", "no_of_mc", "loose", "status", "remarks"]
    for f in editable:
        if f in payload: setattr(row, f, payload[f])

    pack = db.query(packing_styles).filter(packing_styles.company_id == comp_code, packing_styles.packing_style == row.packing_style).first()
    if pack:
        row.quantity = (float(row.no_of_mc or 0) * float(pack.mc_weight or 0)) + (float(row.loose or 0) * float(pack.slab_weight or 0))
    
    db.commit()
    return {"status": "success"}

# ------------------------------------------------------------
# 3. DELETE ENTRY
# ------------------------------------------------------------
@router.post("/delete")
async def delete_entry(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    row = db.query(cold_storage_holding).filter(cold_storage_holding.id == payload.get("id"), cold_storage_holding.company_id == comp_code).first()
    if row:
        db.delete(row); db.commit()
        return {"status": "success"}
    raise HTTPException(status_code=404)

# ------------------------------------------------------------
# 4. EXCEL EXPORT (SYNCED)
# ------------------------------------------------------------
@router.get("/export_xlsx")
def export_xlsx(request: Request, db: Session = Depends(get_db), from_date: str = "", to_date: str = ""):
    comp_code = request.session.get("company_code")
    q = db.query(cold_storage_holding).filter(cold_storage_holding.company_id == comp_code)
    if from_date: q = q.filter(cold_storage_holding.in_date >= date.fromisoformat(from_date))
    if to_date: q = q.filter(cold_storage_holding.in_date <= date.fromisoformat(to_date))
    rows = q.all()
    
    wb = Workbook(); ws = wb.active; ws.title = "CS Report"
    ws.append(["Date", "Storage", "Batch #", "Type", "Species", "MC", "Qty", "Inv Val", "Hold Cost", "Total"])
    
    for r in rows:
        h_cost = calculate_batch_holding_cost(db, r.batch_number, comp_code, r.id) if str(r.cargo_movement_type).upper() == 'IN' else 0
        total_p = h_cost + (float(r.other_charges or 0))
        ws.append([str(r.in_date), r.cold_storage_name, r.batch_number, r.cargo_movement_type, r.species, r.no_of_mc, r.quantity, r.inventory_value, h_cost, total_p])

    stream = BytesIO(); wb.save(stream); stream.seek(0)
    return StreamingResponse(stream, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=CS_Report.xlsx"})
