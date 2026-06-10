from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime
from app.utils.timezone import ist_now
from app.database import get_db
from app.database.models.processing import RawMaterialPurchasing, Grading, Peeling
from app.database.models.reprocess import Reprocess
from app.services.floor_balance import get_floor_balance

router = APIRouter(tags=["FLOOR BALANCE REPORT"])
templates = Jinja2Templates(directory="app/templates")

@router.get("/floor_balance_report", response_class=HTMLResponse)
def floor_balance_report(request: Request, db: Session = Depends(get_db)):
    # 1. సెషన్ నుండి కంపెనీ ఐడి తీసుకోవడం (Security Check)
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    all_combos = set()
    report_date = ist_now().date()

    # --- 1. RMP & PROCESSING SOURCES ---
    rmp_data = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.company_id == company_id).all()
    for r in rmp_data:
        if r.batch_number:
            all_combos.add((r.batch_number, r.count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP"))

    grad_data = db.query(Grading).filter(Grading.company_id == company_id).all()
    for g in grad_data:
        if g.batch_number:
            all_combos.add((g.batch_number, g.graded_count, g.species, g.variety_name, g.production_for, g.peeling_at or "Floor", "RMP"))

    peel_data = db.query(Peeling).filter(Peeling.company_id == company_id).all()
    for p in peel_data:
        if p.batch_number:
            all_combos.add((p.batch_number, p.hlso_count, p.species, p.variety_name, p.production_for, p.peeling_at or "Floor", "RMP"))

    # --- 2. REPROCESS SOURCES ---
    repro_data = db.query(Reprocess).filter(
        Reprocess.company_id == company_id, 
        Reprocess.reprocess_type != 'SALES'
    ).all()
    
    for r in repro_data:
        if r.new_batch_id:
            p_for = r.production_for
            if not p_for or str(p_for).strip().upper() == "N/A":
                orig = db.query(RawMaterialPurchasing.production_for).filter(
                    RawMaterialPurchasing.batch_number == r.original_batch,
                    RawMaterialPurchasing.company_id == company_id
                ).first()
                if orig:
                    p_for = orig[0]
            
            p_for_final = str(p_for).strip() if p_for else "N/A"
            loc = str(r.production_at).strip() if r.production_at else "Floor"
            
            all_combos.add((
                str(r.new_batch_id).strip(), 
                str(r.grade).strip() if r.grade else "N/A", 
                str(r.species).strip() if r.species else "N/A", 
                str(r.variety).strip() if r.variety else "N/A", 
                p_for_final, 
                loc, 
                "REPROCESS"
            ))

    # --- 3. LIVE STOCK CALCULATION ---
    rows_batch = []
    for batch, count, species_val, variety, prod_for, location, s_type in all_combos:
        pass_prod_for = None if prod_for == "N/A" else prod_for
        qty = get_floor_balance(
            db=db, 
            company_id=company_id, 
            location=location, 
            batch=batch, 
            count=count if count != "N/A" else None, 
            species=species_val if species_val != "N/A" else None, 
            variety=variety if variety != "N/A" else None,
            production_for=pass_prod_for, 
            source_type=s_type
        )
        
        if qty and qty > 0.01:
            rows_batch.append({
                "batch": batch,
                "variety": variety,
                "count": count,
                "species": species_val,
                "production_for": prod_for,
                "location": location,
                "available_qty": round(qty, 2),
                "source": s_type,
                "date": report_date
            })

    # --- 4. SORTING ---
    rows_batch.sort(key=lambda x: (
        str(x["location"]), 
        str(x["production_for"]), 
        str(x["species"]), 
        str(x["variety"]), 
        str(x["count"])
    ))

    # --- 5. RETURN (FIXED LINE) ---
    return templates.TemplateResponse(
        request=request,
        name="reports/floor_balance_report.html",
        context={"rows_batch": rows_batch}
    )