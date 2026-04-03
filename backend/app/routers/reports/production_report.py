from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, date
import pytz
from io import BytesIO
from openpyxl import Workbook
from weasyprint import HTML

from app.database import get_db
from app.database.models.processing import Production, AuditLog
from app.database.models.users import Company
from app.database.models.criteria import (
    brands, species as species_model, varieties, glazes, 
    freezers, packing_styles, production_for, production_at, 
    production_types, grades
)

router = APIRouter(prefix="/production_report", tags=["PRODUCTION REPORT"])

IST = pytz.timezone('Asia/Kolkata')

# ------------------------------------------------------------
# HELPER: GET COMPANY INFO
# ------------------------------------------------------------
def get_company_info(db: Session, comp_code: str):
    c = db.query(Company).filter(Company.company_code == comp_code).first()
    return (c.company_name or "", c.address or "") if c else ("", "")

# ------------------------------------------------------------
# MAIN REPORT PAGE
# ------------------------------------------------------------
@router.get("", response_class=HTMLResponse)
@router.get("/", response_class=HTMLResponse)
def production_report_page(
    request: Request,
    db: Session = Depends(get_db),
    from_date: str = "",
    to_date: str = ""
):
    email = request.session.get("email")
    comp_code = request.session.get("company_code")
    role = request.session.get("role")

    if not email or not comp_code:
        return RedirectResponse("/auth/login", status_code=302)

    comp_code = str(comp_code)
    q = db.query(Production).filter(Production.company_id == comp_code)

    if from_date:
        try: q = q.filter(Production.date >= date.fromisoformat(from_date))
        except: pass
    if to_date:
        try: q = q.filter(Production.date <= date.fromisoformat(to_date))
        except: pass

    rows = q.order_by(desc(Production.date), desc(Production.id)).all()

    # Master Data fetching for Searchable Dropdowns
    def get_list(model, attr):
        return sorted(list({getattr(x, attr) for x in db.query(model).filter(model.company_id == comp_code).all() if getattr(x, attr)}))

    company_name, company_address = get_company_info(db, comp_code)

    return request.app.state.templates.TemplateResponse(
        request,
        "reports/production_report.html",
        {
            "rows": rows,
            "from_date": from_date,
            "to_date": to_date,
            "is_admin": role == "admin",
            "company_name": company_name,
            "company_address": company_address,
            "brands_list": get_list(brands, "brand_name"),
            "species_list": get_list(species_model, "species_name"),
            "varieties_list": get_list(varieties, "variety_name"),
            "grades_list": get_list(grades, "grade_name"),
            "glazes_list": get_list(glazes, "glaze_name"),
            "freezers_list": get_list(freezers, "freezer_name"),
            "packing_styles_list": get_list(packing_styles, "packing_style"),
            "prod_at_list": get_list(production_at, "production_at"),
            "prod_for_list": get_list(production_for, "production_for"),
            "prod_types_list": get_list(production_types, "production_type")
        }
    )

# ------------------------------------------------------------
# UPDATE WITH AUDIT LOG & QTY RE-CALCULATION
# ------------------------------------------------------------
@router.post("/update")
def update_production(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    comp_code = str(request.session.get("company_code"))
    user_email = request.session.get("email")
    
    if request.session.get("role") != "admin": 
        raise HTTPException(status_code=403, detail="Admin access required")

    row = db.query(Production).filter(Production.id == payload.get("id"), Production.company_id == comp_code).first()
    if not row: 
        raise HTTPException(status_code=404, detail="Record not found")

    fields = [
        "batch_number", "brand", "variety_name", "glaze", "freezer", 
        "packing_style", "grade", "no_of_mc", "loose", "production_type",
        "species", "production_at", "production_for"
    ]

    has_changes = False
    for f in fields:
        if f in payload:
            old_val = str(getattr(row, f)) if getattr(row, f) is not None else ""
            new_val = str(payload[f])
            
            if old_val != new_val:
                db.add(AuditLog(
                    table_name="production",
                    record_id=row.id,
                    company_id=comp_code,
                    field_name=f,
                    old_value=old_val,
                    new_value=new_val,
                    edited_by=user_email,
                    edited_at=datetime.utcnow()
                ))
                setattr(row, f, payload[f])
                has_changes = True

    if has_changes:
        # Re-calculating production quantity based on Packing Style Master
        pack = db.query(packing_styles).filter(
            packing_styles.company_id == comp_code, 
            packing_styles.packing_style == row.packing_style
        ).first()
        
        if pack:
            row.production_qty = round((float(row.no_of_mc or 0) * float(pack.mc_weight or 1)) + \
                                 (float(row.loose or 0) * float(pack.slab_weight or 1)), 2)

        db.commit()
        return {"status": "success", "new_qty": row.production_qty}

    return {"status": "no_changes"}

# ------------------------------------------------------------
# DELETE RECORD
# ------------------------------------------------------------
@router.post("/delete")
def delete_production(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    comp_code = str(request.session.get("company_code"))
    if request.session.get("role") != "admin": raise HTTPException(status_code=403)
    db.query(Production).filter(Production.id == payload.get("id"), Production.company_id == comp_code).delete()
    db.commit()
    return {"deleted": True}

# ------------------------------------------------------------
# VIEW AUDIT HISTORY (JOINED WITH BATCH INFO)
# ------------------------------------------------------------
@router.get("/audit_all")
def get_production_audit(request: Request, db: Session = Depends(get_db)):
    comp_code = str(request.session.get("company_code"))
    logs = db.query(AuditLog, Production.batch_number)\
        .join(Production, AuditLog.record_id == Production.id)\
        .filter(AuditLog.table_name == "production", AuditLog.company_id == comp_code)\
        .order_by(desc(AuditLog.edited_at)).limit(100).all()
    
    return JSONResponse([
        {
            "timestamp": l.AuditLog.edited_at.replace(tzinfo=pytz.utc).astimezone(IST).strftime("%d-%m-%Y %H:%M:%S"),
            "batch": batch,
            "field": l.AuditLog.field_name.replace('_', ' ').title(),
            "details": f"'{l.AuditLog.old_value}' → '{l.AuditLog.new_value}'",
            "user": l.AuditLog.edited_by.split('@')[0] if l.AuditLog.edited_by else "System"
        } for l, batch in logs
    ])

# ------------------------------------------------------------
# EXPORTS (EXCEL & PDF)
# ------------------------------------------------------------
@router.get("/export_xlsx")
def export_production_xlsx(request: Request, db: Session = Depends(get_db), ids: str = Query(None), from_date: str = "", to_date: str = ""):
    comp_code = str(request.session.get("company_code"))
    q = db.query(Production).filter(Production.company_id == comp_code)
    
    if ids:
        id_list = [int(i) for i in ids.split(",") if i]
        q = q.filter(Production.id.in_(id_list))
    else:
        if from_date: q = q.filter(Production.date >= date.fromisoformat(from_date))
        if to_date: q = q.filter(Production.date <= date.fromisoformat(to_date))
    
    rows = q.order_by(desc(Production.date)).all()
    wb = Workbook()
    ws = wb.active
    ws.title = "Production"
    ws.append(["Date", "Batch #", "Brand", "Variety", "Species", "Grade", "Glaze", "Freezer", "MC", "Loose", "Qty", "Type", "At", "For", "User"])
    
    for r in rows:
        ws.append([str(r.date), r.batch_number, r.brand, r.variety_name, r.species, r.grade, r.glaze, r.freezer, r.no_of_mc, r.loose, r.production_qty, r.production_type, r.production_at, r.production_for, r.email])
    
    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    return StreamingResponse(stream, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=Production_Report.xlsx"})

@router.get("/export_pdf")
def export_production_pdf(request: Request, db: Session = Depends(get_db), ids: str = Query(None), download: bool = Query(False)):
    comp_code = str(request.session.get("company_code"))
    q = db.query(Production).filter(Production.company_id == comp_code)
    
    if ids:
        id_list = [int(i) for i in ids.split(",") if i]
        q = q.filter(Production.id.in_(id_list))
    
    rows = q.order_by(Production.date.asc()).all()
    company_name, company_address = get_company_info(db, comp_code)
    
    html = request.app.state.templates.get_template("reports/production_report_print.html").render({
        "request": request,
        "rows": rows,
        "company_name": company_name,
        "company_address": company_address,
        "printed_on": datetime.now(IST).strftime("%d-%m-%Y %H:%M:%S")
    })
    
    pdf_file = HTML(string=html).write_pdf()
    disposition = "attachment" if download else "inline"
    
    return StreamingResponse(
        BytesIO(pdf_file), 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"{disposition}; filename=Production_Report.pdf"}
    )