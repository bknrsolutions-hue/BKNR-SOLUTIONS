# ============================================================================
# PRODUCTION REPORT ROUTER (BKNR ERP - FULLY UPDATED WITH FY)
# ============================================================================

from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import desc, extract, func
from datetime import datetime, date
import datetime as dt
from app.utils.timezone import ist_now

from io import BytesIO
from openpyxl import Workbook
from openpyxl.styles import Font
from app.services.pdf_renderer import render_pdf_from_html
from app.utils.global_filters import get_global_filters
from app.utils.cancel_math import signed_number, signed_sum

from app.database import get_db
from app.database.models.processing import Production, AuditLog, Soaking
from app.database.models.users import Company
from app.database.models.criteria import (
    brands, species as species_model, varieties, glazes, 
    freezers, packing_styles, production_for, production_at, 
    production_types, grades
)
from app.services.cache import cache_get, cache_set

router = APIRouter(prefix="/production_report", tags=["PRODUCTION REPORT"])

templates = Jinja2Templates(directory="app/templates")


# ------------------------------------------------------------
# HELPER: GET COMPANY INFO
# ------------------------------------------------------------
def get_company_info(db: Session, comp_code: str):
    c = db.query(Company).filter(Company.company_code == comp_code).first()
    return (c.company_name or "", c.address or "") if c else ("", "")


def get_company_mpeda_code(db: Session, comp_code: str):
    c = db.query(Company).filter(Company.company_code == comp_code).first()
    return c.mpeda_registration_code if c and c.mpeda_registration_code else ""


def row_to_dict(row):
    return {k: v for k, v in row.__dict__.items() if not k.startswith("_")}

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
    from app.utils.report_permissions import check_report_permission
    selected_production_for, selected_location = get_global_filters(request)
    comp_code = request.session.get("company_code")
    role = request.session.get("role")

    if not comp_code:
        return RedirectResponse("/auth/login", status_code=302)
    is_json = request.query_params.get("format") == "json"
    if fy is None:
        today = ist_now().date()
        fy = "" if is_json else str(today.year if today.month >= 4 else today.year - 1)

    comp_code = str(comp_code)
    if not is_json:
        cache_key = (
            f"bknr:processing_reports:{comp_code}:production_report:"
            f"{fy or 'NONE'}:{from_date or 'NONE'}:{to_date or 'NONE'}:"
            f"{selected_production_for or 'ALL'}:{selected_location or 'ALL'}"
        )
        cached_context = cache_get(cache_key)
        if cached_context is not None:
            return templates.TemplateResponse(
                request=request,
                name="reports/production_report.html",
                context=cached_context,
            )
    
    # Base Query
    q = db.query(Production).filter(
        Production.company_id == comp_code
    )
    
    # 🟢 FIX 1: Syntax Bracket Alignment Resolved for Base Query Filter Pipeline
    if selected_production_for:
        q = q.filter(Production.production_for == selected_production_for)
        
    if selected_location:
        q = q.filter(Production.production_at == selected_location)

    if fy == "" and not is_json:
        q = q.filter(Production.id == -1)
    elif fy:
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

            soaking_in = db.query(signed_sum(Soaking, Soaking.in_qty)).filter(
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
        
        summary_subtotals[key]["mc"] += signed_number(r, r.no_of_mc)
        summary_subtotals[key]["loose"] += signed_number(r, r.loose)
        summary_subtotals[key]["prod_qty"] += signed_number(r, r.production_qty)

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
        
        detail_subtotals[key]["mc"] += signed_number(r, r.no_of_mc)
        detail_subtotals[key]["loose"] += signed_number(r, r.loose)
        detail_subtotals[key]["prod_qty"] += signed_number(r, r.production_qty)


    def get_list(model, attr):
        return [getattr(x, attr) for x in db.query(model).filter(model.company_id == comp_code).all()]

    company_name, company_address = get_company_info(db, comp_code)

    context = {
            "summary_rows": summary_rows,         
            "summary_subtotals": summary_subtotals, 
            "detail_rows": detail_rows,           
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
            "today_date": ist_now().strftime("%d %b, %Y"),
            "can_edit": check_report_permission(request, "report_edit"),
            "can_delete": check_report_permission(request, "report_delete"),
            "can_print": check_report_permission(request, "report_print"),
            "can_export": check_report_permission(request, "report_export"),
        }
    if is_json:
        # Generate financial years from database for dropdown
        all_dates = db.query(Production.date).filter(Production.company_id == comp_code, Production.date != None).all()
        fy_set = set()
        for d_tuple in all_dates:
            d = d_tuple[0]
            fy_set.add(f"{d.year}" if d.month >= 4 else f"{d.year - 1}")
        financial_years = sorted(list(fy_set), reverse=True)

        context_json = {**context}
        context_json["financial_years"] = financial_years
        
        # Serialize list of rows to dictionary
        context_json["summary_rows"] = []
        for r in summary_rows:
            d = row_to_dict(r)
            if isinstance(d.get("date"), (date, datetime)):
                d["date"] = d["date"].isoformat()
            if isinstance(d.get("time"), (dt.time, datetime)):
                d["time"] = d["time"].strftime("%H:%M")
            context_json["summary_rows"].append(d)

        context_json["detail_rows"] = []
        for r in detail_rows:
            d = row_to_dict(r)
            if isinstance(d.get("date"), (date, datetime)):
                d["date"] = d["date"].isoformat()
            if isinstance(d.get("time"), (dt.time, datetime)):
                d["time"] = d["time"].strftime("%H:%M")
            context_json["detail_rows"].append(d)

        # Convert dictionary keys of summary_subtotals to strings
        subtotals_json = {}
        for key, val in summary_subtotals.items():
            str_key = "__".join(str(k or "") for k in key)
            subtotals_json[str_key] = val
        context_json["summary_subtotals"] = subtotals_json

        # Convert detail_subtotals keys
        detail_subtotals_json = {}
        for key, val in detail_subtotals.items():
            str_key = str(key.isoformat() if isinstance(key, (date, datetime)) else key)
            detail_subtotals_json[str_key] = val
        context_json["detail_subtotals"] = detail_subtotals_json

        from fastapi.responses import JSONResponse
        context_json.pop("datetime", None)
        import datetime as dt_mod
        def serialize_val(v):
            if isinstance(v, (dt_mod.datetime, dt_mod.date)):
                return v.isoformat()
            if isinstance(v, dt_mod.time):
                return v.strftime("%H:%M")
            if isinstance(v, list):
                return [serialize_val(item) for item in v]
            if isinstance(v, dict):
                return {key: serialize_val(val) for key, val in v.items()}
            return v
        return JSONResponse(serialize_val(context_json))

    cache_context = dict(context)
    cache_context["summary_rows"] = [row_to_dict(r) for r in summary_rows]
    cache_context["detail_rows"] = [row_to_dict(r) for r in detail_rows]
    cache_set(cache_key, cache_context, ttl=75)

    return templates.TemplateResponse(
        request=request,
        name="reports/production_report.html",
        context=context
    )

# ------------------------------------------------------------
# UPDATE WITH AUDIT LOG & GLAZE ADJUSTMENT
# ------------------------------------------------------------
@router.post("/update")
def update_production(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    comp_code = str(request.session.get("company_code"))
    user_email = request.session.get("email")
    
    from app.utils.report_permissions import enforce_report_permission
    enforce_report_permission(request, "report_edit")

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
    
    from app.utils.report_permissions import enforce_report_permission
    enforce_report_permission(request, "report_delete")
    
    row = db.query(Production).filter(Production.id == payload.get("id"), Production.company_id == comp_code).first()
    if row:
        db.add(AuditLog(
            table_name="production", record_id=row.id, company_id=comp_code,
            field_name="is_cancelled", old_value="False", new_value="True",
            edited_by=user_email, edited_at=datetime.utcnow()
        ))
        row.is_cancelled = True
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
        "record_id": l.AuditLog.record_id,
        "timestamp": l.AuditLog.edited_at.strftime("%d-%m-%Y %H:%M:%S"),
        "user": l.AuditLog.edited_by.split('@')[0] if l.AuditLog.edited_by else "System",
        "email": l.AuditLog.edited_by if l.AuditLog.edited_by else "System",
        "batch": f"Row ID #{l.AuditLog.record_id} • Batch: {l.batch_number}" if l.batch_number else f"Row ID #{l.AuditLog.record_id}",
        "action": f"Changed {l.AuditLog.field_name.replace('_', ' ').title()}" if l.AuditLog.field_name != "DELETE" else "Deleted Record",
        "details": f"{l.AuditLog.old_value} ➔ {l.AuditLog.new_value}"
    } for l in logs]

# ------------------------------------------------------------
# 3. EXCEL EXPORT (WITH UNIVERSAL GLOBAL FILTERS LAYER)
# ------------------------------------------------------------
@router.get("/export_xlsx")
def export_production_xlsx(request: Request, db: Session = Depends(get_db), ids: str = Query(None), from_date: str = "", to_date: str = ""):
    comp_code = str(request.session.get("company_code"))
    from app.utils.report_permissions import enforce_report_permission
    enforce_report_permission(request, "report_export")
    
    # 2. 🟢 FIX 2: Evaluate global contextual filter arrays inside Excel Compiler
    selected_production_for, selected_location = get_global_filters(request)
    
    q = db.query(Production).filter(
        Production.company_id == comp_code
    )
    
    if selected_production_for:
        q = q.filter(Production.production_for == selected_production_for)

    if selected_location:
        q = q.filter(Production.production_at == selected_location)
    
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

# ------------------------------------------------------------
# 4. PDF EXPORT (WITH UNIVERSAL GLOBAL FILTERS LAYER)
# ------------------------------------------------------------
@router.get("/export_pdf")
def export_production_pdf(
    request: Request, 
    db: Session = Depends(get_db), 
    ids: str = Query(None), 
    download: bool = Query(False)
):
    comp_code = str(request.session.get("company_code"))
    from app.utils.report_permissions import enforce_report_permission
    enforce_report_permission(request, "report_export")
    
    # 3. 🟢 FIX 3: Evaluate global contextual filter arrays inside PDF Compiler
    selected_production_for, selected_location = get_global_filters(request)
    
    q = db.query(Production).filter(
        Production.company_id == comp_code
    )
    
    if selected_production_for:
        q = q.filter(Production.production_for == selected_production_for)

    if selected_location:
        q = q.filter(Production.production_at == selected_location)
    
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
        "mpeda_registration_code": get_company_mpeda_code(db, comp_code),
        "printed_on": ist_now().strftime("%d-%m-%Y %H:%M:%S")
    })
    
    pdf_file = render_pdf_from_html(html_content)
    disposition = "attachment" if download else "inline"
    
    return StreamingResponse(
        BytesIO(pdf_file), 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"{disposition}; filename=Production_Report.pdf"}
    )
