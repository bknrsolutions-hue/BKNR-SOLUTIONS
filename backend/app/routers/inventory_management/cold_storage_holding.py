import pytz
from fastapi import APIRouter, Request, Form, Depends, Body
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from datetime import datetime, date

from app.database import get_db
# Models import
from app.database.models.inventory_management import cold_storage_holding, cold_storage, pending_orders, stock_entry
from app.database.models.processing import GateEntry
from app.database.models.reprocess import Reprocess
from app.database.models.criteria import (
    brands, glazes, varieties, grades, packing_styles, freezers,
    production_for, 
    species as species_model
)

router = APIRouter(tags=["COLD STORAGE HOLDING"])

# Jinja2 setup with 'do' extension enabled
templates = Jinja2Templates(directory="app/templates")
templates.env.add_extension('jinja2.ext.do') # <--- ఈ లైన్ HTML ఎర్రర్‌ను ఫిక్స్ చేస్తుంది

# ==================================================
# LOAD COLD STORAGE HOLDING PAGE
# ==================================================
@router.get("/cold_storage_holding", response_class=HTMLResponse)
def holding_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/auth/login", status_code=302)

    success_msg = request.session.pop("success_msg", None)

    # 1. Recent Holdings
    current_holdings = (
        db.query(cold_storage_holding)
        .filter(cold_storage_holding.company_id == company_code)
        .order_by(cold_storage_holding.id.desc())
        .all()
    )

    # 2. Storage Masters
    storage_masters = db.query(cold_storage).filter(
        cold_storage.company_id == company_code,
        cold_storage.is_active == "ACTIVE"
    ).all()

    # 3. Production For List
    prod_for_list = db.query(production_for).filter(production_for.company_id == company_code).all()

    # 4. Master Data for Dropdowns
    po_numbers_list = [
        p.po_number for p in 
        db.query(pending_orders.po_number)
        .filter(pending_orders.company_id == company_code)
        .distinct()
        .order_by(pending_orders.po_number)
        .all() if p.po_number
    ]

    context = {
        "request": request,
        "success_msg": success_msg,
        "current_holdings": current_holdings,
        "storage_masters": storage_masters,
        "production_for_list": prod_for_list,
        "brands": [b.brand_name for b in db.query(brands).filter(brands.company_id == company_code).all()],
        "species": [s.species_name for s in db.query(species_model).filter(species_model.company_id == company_code).all()],
        "glazes": [g.glaze_name for g in db.query(glazes).filter(glazes.company_id == company_code).all()],
        "varieties": [v.variety_name for v in db.query(varieties).filter(varieties.company_id == company_code).all()],
        "grades": [g.grade_name for g in db.query(grades).filter(grades.company_id == company_code).all()],
        "freezers": [f.freezer_name for f in db.query(freezers).filter(freezers.company_id == company_code).all()],
        "packing_styles": db.query(packing_styles).filter(packing_styles.company_id == company_code).all(),
        "pending_orders": po_numbers_list,
    }

    return templates.TemplateResponse(
        request=request, 
        name="inventory_management/cold_storage_holding.html", 
        context=context
    )

# ==================================================
# API TO GET BATCHES FILTERED BY PURPOSE "STORING"
# ==================================================
@router.get("/get_storing_batches")
async def get_storing_batches(
    production_for_val: str, 
    purpose_val: str = "Storing", 
    db: Session = Depends(get_db), 
    request: Request = None
):
    company_code = request.session.get("company_code")

    # Reprocess టేబుల్ నుండి ఫిల్టర్ చేస్తున్నాం
    batches = (
        db.query(Reprocess.new_batch_id)
        .filter(
            Reprocess.company_id == company_code,
            Reprocess.production_for == production_for_val,
            # ఇక్కడ కాలమ్ పేరు reprocess_type అని మార్చాను
            func.lower(Reprocess.reprocess_type) == func.lower(purpose_val),
            Reprocess.new_batch_id != None,
            Reprocess.new_batch_id != ""
        )
        .distinct()
        .all()
    )
    
    result = [b.new_batch_id for b in batches]
    
    # Debugging కోసం
    print(f"Client: {production_for_val}, Type: {purpose_val}, Found: {len(result)}")
    
    return {"batches": result}
# ==================================================
# SAVE HOLDING ENTRY (IN/OUT)
# ==================================================
@router.post("/cold_storage_holding/save")
async def save_holding(
    request: Request,
    db: Session = Depends(get_db),
    cold_storage_name: str = Form(...),
    address: str = Form(...),
    batch_number: str = Form(...),
    cargo_movement_type: str = Form(...),
    species: str = Form(...),
    variety: str = Form(...),
    grade: str = Form(...),
    brand: str = Form(...),
    packing_style: str = Form(...),
    no_of_mc: int = Form(0),
    loose: int = Form(0),
    quantity: float = Form(0.0),
    freezer: str = Form(""),
    rent_start_date: str = Form(None),
    storage_rate_per_mc: float = Form(0.0),
    glaze: str = Form(""),
    purpose: str = Form("Storing"),
    production_for: str = Form(...),
    po_number: str = Form("N/A"),
    remarks: str = Form("")
):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        rent_date = datetime.strptime(rent_start_date, "%Y-%m-%d").date() if rent_start_date else date.today()
    except:
        rent_date = date.today()

    kg_val = 0.0
    rp_batch = db.query(Reprocess).filter(
        Reprocess.new_batch_id == batch_number,
        Reprocess.company_id == company_code
    ).first()
    if rp_batch:
        kg_val = rp_batch.product_kg_value or 0.0

    new_entry = cold_storage_holding(
        cold_storage_name=cold_storage_name,
        address=address,
        batch_number=batch_number,
        cargo_movement_type=cargo_movement_type,
        species=species,
        variety=variety,
        grade=grade,
        brand=brand,
        packing_style=packing_style,
        glaze=glaze,
        freezer=freezer,
        no_of_mc=no_of_mc,
        loose=loose,
        quantity=quantity,
        product_kg_value=kg_val,
        purpose=purpose,
        production_for=production_for,
        po_number=po_number,
        rent_start_date=rent_date,
        storage_rate_per_mc=storage_rate_per_mc,
        remarks=remarks,
        status="HOLDING" if cargo_movement_type == "IN" else "DISPATCHED",
        email=email,
        company_id=company_code,
        in_date=date.today()
    )

    try:
        db.add(new_entry)
        db.commit()
        
        if request.headers.get("X-Requested-With") == "XMLHttpRequest":
            return JSONResponse({"status": "success", "message": "Entry Saved Successfully"})
            
        request.session["success_msg"] = f"Holding Entry for Batch {batch_number} Saved Successfully!"
        return RedirectResponse("/inventory/cold_storage_holding", status_code=303)
    except Exception as e:
        db.rollback()
        return JSONResponse({"error": str(e)}, status_code=500)

# ==================================================
# DELETE ENTRY
# ==================================================
@router.post("/cold_storage_holding/delete/{entry_id}")
def delete_holding(entry_id: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    
    if not company_code:
        return RedirectResponse("/auth/login", status_code=302)

    db.query(cold_storage_holding).filter(
        cold_storage_holding.id == entry_id,
        cold_storage_holding.company_id == company_code
    ).delete()
    
    db.commit()
    return RedirectResponse("/inventory/cold_storage_holding", status_code=303)