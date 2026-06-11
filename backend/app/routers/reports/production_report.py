# ============================================================
# PRODUCTION REPORT ROUTER (BKNR ERP - FULLY UPDATED WITH FY)
# ============================================================

from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import desc, extract, func
from datetime import datetime, date
from app.utils.timezone import ist_now

from io import BytesIO
from openpyxl import Workbook
from openpyxl.styles import Font
from weasyprint import HTML

from app.database import get_db
from app.database.models.processing import Production, AuditLog, Soaking
from app.database.models.users import Company
from app.database.models.criteria import (
    brands, species as species_model, varieties, glazes, 
    freezers, packing_styles, production_for, production_at, 
    production_types, grades
)

router = APIRouter(prefix="/production_report", tags=["PRODUCTION REPORT"])

templates = Jinja2Templates(directory="app/templates")


# ------------------------------------------------------------
# HELPER: GET COMPANY INFO
# ------------------------------------------------------------
def get_company_info(db: Session, comp_code: str):
    c = db.query(Company).filter(Company.company_code == comp_code).first()
    return (c.company_name or "", c.address or "") if c else ("", "")

# ------------------------------------------------------------
# MAIN REPORT PAGE (WITH DUAL GROUPING SUB-TOTALS)
# ------------------------------------------------------------
@router.get("", response_class=HTMLResponse)
@router.get("/", response_class=HTMLResponse)
def production_report_page(
    request: Request,
    fy: str = Query(None),
    from_date: str = "",
    to_date: str = "",
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    role = request.session.get("role")

    if not comp_code:
        return RedirectResponse("/auth/login", status_code=302)

    comp_code = str(comp_code)
    
    # Base Query
    q = db.query(Production).filter(Production.company_id == comp_code)

    if fy:
        start_year = int(fy)
        end_year = start_year + 1
        q = q.filter(
            Production.date >= f"{start_year}-04-01",
            Production.date <= f"{end_year}-03-31"
        )

    if from_date:
        try: q = q.filter(Production.date >= date.fromisoformat(from_date))
        except: pass
    if to_date:
        try: q = q.filter(Production.date <= date.fromisoformat(to_date))
        except: pass

    all_data = q.all()

    # ============================================================
    # 1. SUMMARY TABLE LOGIC (Grouped by: At, For, Batch, Variety, Grade)
    # ============================================================
    summary_rows = sorted(all_data, key=lambda x: (
        x.production_at or "", 
        x.production_for or "", 
        x.batch_number or "", 
        x.variety_name or "", 
        x.grade or ""
    ))

    summary_subtotals = {}
    for r in summary_rows:
        key = (r.production_at, r.production_for, r.batch_number, r.variety_name, r.grade)
        
        if key not in summary_subtotals:
            var_data = db.query(varieties).filter(
                varieties.company_id == comp_code,
                varieties.variety_name == r.variety_name
            ).first()
            target_yield = float(var_data.soaking_yield or 0) if var_data else 0.0

            soaking_in = db.query(func.sum(Soaking.in_qty)).filter(
                Soaking.company_id == comp_code,
                Soaking.batch_number == r.batch_number,
                Soaking.variety_name == r.variety_name
            ).scalar() or 0.0

            summary_subtotals[key] = {
                "mc": 0, "loose": 0, "prod_qty": 0.0,
                "target_yield": target_yield,
                "soaking_in": float(soaking_in),
                "actual_yield": 0.0, "diff_yield_perc": 0.0, "diff_qty": 0.0
            }
        
        summary_subtotals[key]["mc"] += float(r.no_of_mc or 0)
        summary_subtotals[key]["loose"] += float(r.loose or 0)
        summary_subtotals[key]["prod_qty"] += float(r.production_qty or 0)

    for key, s in summary_subtotals.items():
        if s["soaking_in"] > 0:
            s["actual_yield"] = round((s["prod_qty"] / s["soaking_in"]) * 100, 2)
            s["diff_yield_perc"] = round(s["actual_yield"] - s["target_yield"], 2)
            expected_qty = (s["soaking_in"] * s["target_yield"]) / 100
            s["diff_qty"] = round(s["prod_qty"] - expected_qty, 2)

    # ============================================================
    # 2. DETAILED TABLE LOGIC (Grouped by: Date)
    # ============================================================
    detail_rows = sorted(all_data, key=lambda x: (x.date or date.min, x.time or datetime.min.time()), reverse=True)
    
    detail_subtotals = {}
    for r in detail_rows:
        key = r.date
        if key not in detail_subtotals:
            detail_subtotals[key] = {"mc": 0, "loose": 0, "prod_qty": 0.0}
        
        detail_subtotals[key]["mc"] += float(r.no_of_mc or 0)
        detail_subtotals[key]["loose"] += float(r.loose or 0)
        detail_subtotals[key]["prod_qty"] += float(r.production_qty or 0)


    def get_list(model, attr):
        return [getattr(x, attr) for x in db.query(model).filter(model.company_id == comp_code).all()]

    company_name, company_address = get_company_info(db, comp_code)

    return templates.TemplateResponse(
        request=request,
        name="reports/production_report.html",
        context={
            "summary_rows": summary_rows,         # Added for Tab 1
            "summary_subtotals": summary_subtotals, 
            "detail_rows": detail_rows,           # Added for Tab 2
            "detail_subtotals": detail_subtotals,
            "selected_fy": fy,
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
            "prod_types_list": get_list(production_types, "production_type"),
            "today_date": ist_now().strftime("%d %b, %Y")
        }
    )

# ------------------------------------------------------------
# UPDATE WITH AUDIT LOG & GLAZE ADJUSTMENT
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
                audit = AuditLog(
                    table_name="production",
                    record_id=row.id,
                    company_id=comp_code,
                    field_name=f,
                    old_value=old_val,
                    new_value=new_val,
                    edited_by=user_email,
                    edited_at=ist_now()
                )
                db.add(audit)
                
                if f in ["no_of_mc", "loose"]:
                    setattr(row, f, float(payload[f] or 0))
                else:
                    setattr(row, f, payload[f])
                has_changes = True

    if has_changes:
        pack = db.query(packing_styles).filter(
            packing_styles.company_id == comp_code, 
            packing_styles.packing_style == row.packing_style
        ).first()
        
        if pack:
            mc_w = float(pack.mc_weight or 0)
            sl_w = float(pack.slab_weight or 0)
            base_qty = (float(row.no_of_mc or 0) * mc_w) + (float(row.loose or 0) * sl_w)
        else:
            base_qty = 0.0

        final_production_qty = base_qty
        glaze_text = str(row.glaze or "").strip().upper()

        if "NWNC" not in glaze_text:
            import re
            match = re.search(r'(\d+\.?\d*)', glaze_text)
            glaze_percent = float(match.group(1)) if match else 0.0
            if glaze_percent > 0:
                final_production_qty = final_production_qty * ((100 - glaze_percent) / 100)

        row.production_qty = round(final_production_qty, 3)

        try:
            db.commit()
            return {"status": "success", "new_qty": row.production_qty}
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    return {"status": "no_changes"}

# ------------------------------------------------------------
# DELETE RECORD
# ------------------------------------------------------------
@router.post("/delete")
def delete_production(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    comp_code = str(request.session.get("company_code"))
    user_email = request.session.get("email")
    if request.session.get("role") != "admin": raise HTTPException(status_code=403)
    
    row = db.query(Production).filter(Production.id == payload.get("id"), Production.company_id == comp_code).first()
    if row:
        db.add(AuditLog(
            table_name="production", record_id=row.id, company_id=comp_code,
            field_name="DELETE", old_value="Record", new_value="Deleted",
            edited_by=user_email, edited_at=datetime.utcnow()
        ))
        db.delete(row)
        db.commit()
        return {"status": "success"}
    return {"status": "error", "message": "Record not found"}

# ============================================================
# AUDIT HISTORY, EXPORTS
# ============================================================
@router.get("/audit_all")
async def get_all_production_audit(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    logs = (
        db.query(AuditLog, Production.batch_number)
        .join(Production, AuditLog.record_id == Production.id)
        .filter(AuditLog.table_name == "production", AuditLog.company_id == comp_code)
        .order_by(AuditLog.edited_at.desc()).limit(100).all()
    )
    return [{
        "timestamp": l.AuditLog.edited_at.strftime("%d-%m-%Y %H:%M:%S"),
        "user": l.AuditLog.edited_by.split('@')[0],
        "batch": l.batch_number,
        "action": f"Changed {l.AuditLog.field_name.replace('_', ' ').title()}",
        "details": f"{l.AuditLog.old_value} ➔ {l.AuditLog.new_value}"
    } for l in logs]

@router.get("/export_xlsx")
def export_production_xlsx(request: Request, db: Session = Depends(get_db), ids: str = Query(None), from_date: str = "", to_date: str = ""):
    comp_code = str(request.session.get("company_code"))
    q = db.query(Production).filter(Production.company_id == comp_code)
    
    if ids:
        id_list = [int(i) for i in ids.split(",") if i.strip().isdigit()]
        q = q.filter(Production.id.in_(id_list))
    else:
        if from_date: q = q.filter(Production.date >= date.fromisoformat(from_date))
        if to_date: q = q.filter(Production.date <= date.fromisoformat(to_date))
    
    rows = q.order_by(desc(Production.date)).all()
    wb = Workbook()
    ws = wb.active
    ws.title = "Production Report"
    
    headers = ["Date", "Batch #", "Brand", "Variety", "Species", "Grade", "Glaze", "Freezer", "MC", "Loose", "Qty (Kg)", "Type", "At", "For", "User"]
    ws.append(headers)
    for cell in ws[1]: cell.font = Font(bold=True)
    
    for r in rows:
        ws.append([str(r.date), r.batch_number, r.brand, r.variety_name, r.species, r.grade, r.glaze, r.freezer, r.no_of_mc, r.loose, r.production_qty, r.production_type, r.production_at, r.production_for, r.email])
    
    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    return StreamingResponse(
        stream, 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
        headers={"Content-Disposition": "attachment; filename=Production_Report.xlsx"}
    )

@router.get("/export_pdf")
def export_production_pdf(
    request: Request, 
    db: Session = Depends(get_db), 
    ids: str = Query(None), 
    download: bool = Query(False)
):
    comp_code = str(request.session.get("company_code"))
    q = db.query(Production).filter(Production.company_id == comp_code)
    
    if ids:
        id_list = [int(i) for i in ids.split(",") if i.strip().isdigit()]
        q = q.filter(Production.id.in_(id_list))
    
    rows = q.order_by(Production.date.asc()).all()
    company_name, company_address = get_company_info(db, comp_code)
    
    html_content = templates.get_template("reports/production_report_print.html").render({
        "request": request,
        "rows": rows,
        "company_name": company_name,
        "company_address": company_address,
        "printed_on": ist_now().strftime("%d-%m-%Y %H:%M:%S")
    })
    
    pdf_file = HTML(string=html_content).write_pdf()
    disposition = "attachment" if download else "inline"
    
    return StreamingResponse(
        BytesIO(pdf_file), 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"{disposition}; filename=Production_Report.pdf"}
    )